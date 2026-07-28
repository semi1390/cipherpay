import { BrowserProvider, JsonRpcProvider, JsonRpcSigner, Contract, isAddress, Network } from "ethers";
import { createEthersHandleClient, NotYetComputedHandleError } from "@iexec-nox/handle";

// ---- Arbitrum Sepolia (Nox confidential payroll treasury lives here) ----
export const ARBITRUM_CHAIN_ID = 421614n;
export const ARBITRUM_HEX = "0x66eee";
export const EXPLORER = "https://sepolia.arbiscan.io";

export type Hex = `0x${string}`;

// Minimal ABIs (euint256/externalEuint256 are bytes32 at the ABI boundary).
export const TREASURY_ABI = [
  "function runPayroll(address[] employees, bytes32[] encryptedAmounts, bytes[] inputProofs) external",
  "function treasuryBalance() view returns (bytes32)",
  "function grantTreasuryView() external",
  "function batchCount() view returns (uint256)",
  "function token() view returns (address)",
  "function owner() view returns (address)",
];
export const TOKEN_ABI = [
  "function mint(address to, bytes32 encryptedAmount, bytes inputProof) returns (bytes32)",
  "function confidentialBalanceOf(address account) view returns (bytes32)",
  "function owner() view returns (address)",
];

export function getConfiguredTreasury(): string | null {
  const a = import.meta.env.VITE_TREASURY_ADDRESS?.trim();
  return a && isAddress(a) ? a : null;
}

export function getInjected(): NonNullable<Window["ethereum"]> {
  const eth = window.ethereum;
  if (!eth) throw new Error("No injected wallet found. Install MetaMask (or another EIP-1193 wallet).");
  return eth;
}

/**
 * Dedicated Arbitrum Sepolia read RPC (same idea as the Ethereum-Sepolia app):
 * the SDK and reads go through this, not the wallet's RPC. batchMaxCount:1 avoids
 * the "could not coalesce" 404s some wallet/proxy RPCs throw on batched requests.
 */
export function getReadProvider(): JsonRpcProvider {
  const url = import.meta.env.VITE_ARBITRUM_RPC_URL;
  if (!url) {
    throw new Error(
      "Missing VITE_ARBITRUM_RPC_URL. Create .env with your Arbitrum Sepolia RPC (see .env.example)."
    );
  }
  const net = Network.from(421614);
  return new JsonRpcProvider(url, net, { staticNetwork: net, batchMaxCount: 1 });
}

export interface Connection {
  provider: BrowserProvider;
  signer: JsonRpcSigner;
  readProvider: JsonRpcProvider;
  address: string;
  chainId: bigint;
}

export async function connectWallet(): Promise<Connection> {
  const eth = getInjected();
  let provider = new BrowserProvider(eth);
  await provider.send("eth_requestAccounts", []);

  let net = await provider.getNetwork();
  if (net.chainId !== ARBITRUM_CHAIN_ID) {
    try {
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: ARBITRUM_HEX }] });
    } catch (err: unknown) {
      const code = (err as { code?: number })?.code;
      if (code === 4902) {
        await eth.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: ARBITRUM_HEX,
              chainName: "Arbitrum Sepolia",
              nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
              rpcUrls: ["https://sepolia-rollup.arbitrum.io/rpc"],
              blockExplorerUrls: [EXPLORER],
            },
          ],
        });
      } else {
        throw new Error("Please switch your wallet to Arbitrum Sepolia to continue.");
      }
    }
    provider = new BrowserProvider(eth);
    net = await provider.getNetwork();
    if (net.chainId !== ARBITRUM_CHAIN_ID) throw new Error("Wallet is not on Arbitrum Sepolia.");
  }

  const signer = await provider.getSigner();
  const address = await signer.getAddress();
  const readProvider = getReadProvider();
  return { provider, signer, readProvider, address, chainId: net.chainId };
}

/** Hybrid signer: READS via dedicated RPC, SIGNING via the wallet. */
function makeHybridSigner(walletSigner: JsonRpcSigner, readProvider: JsonRpcProvider) {
  return {
    provider: readProvider,
    getAddress: () => walletSigner.getAddress(),
    signTypedData: (domain: unknown, types: unknown, value: unknown) =>
      walletSigner.signTypedData(domain as never, types as never, value as never),
  };
}

export async function makeHandleClient(walletSigner: JsonRpcSigner, readProvider: JsonRpcProvider) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createEthersHandleClient(makeHybridSigner(walletSigner, readProvider) as any);
}

/**
 * Send a tx robustly: price it (fees/gas/nonce) and wait for it via the reliable
 * read RPC, so the wallet's (sometimes flaky) RPC is only used to sign + broadcast.
 * Returns the tx hash.
 */
export async function sendTx(
  conn: Connection,
  contractAddress: string,
  abi: string[],
  method: string,
  args: unknown[]
): Promise<string> {
  const contract = new Contract(contractAddress, abi, conn.signer);
  const data = contract.interface.encodeFunctionData(method, args);
  const [feeData, nonce, gasEstimate] = await Promise.all([
    conn.readProvider.getFeeData(),
    conn.readProvider.getTransactionCount(conn.address),
    conn.readProvider.estimateGas({ from: conn.address, to: contractAddress, data }),
  ]);
  const overrides: Record<string, unknown> = { nonce, gasLimit: (gasEstimate * 12n) / 10n };
  if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
    overrides.maxFeePerGas = feeData.maxFeePerGas;
    overrides.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
  } else if (feeData.gasPrice) {
    overrides.gasPrice = feeData.gasPrice;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tx = await (contract as any)[method](...args, overrides);
  await conn.readProvider.waitForTransaction(tx.hash);
  return tx.hash as string;
}

export function shortAddr(a: string): string {
  return a.length > 10 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

export function fullError(e: unknown): string {
  const parts: string[] = [];
  let cur: unknown = e;
  let depth = 0;
  while (cur && depth < 6) {
    parts.push(cur instanceof Error ? cur.message : String(cur));
    cur = (cur as { cause?: unknown })?.cause;
    depth++;
  }
  return parts.join("  <-  ");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class DecryptDeniedError extends Error {
  constructor() {
    super("Not authorized to decrypt this handle.");
    this.name = "DecryptDeniedError";
  }
}

/** Transient: gateway hasn't indexed the ACL grant yet. */
export function isTransientDecryptError(err: unknown): boolean {
  if (err instanceof NotYetComputedHandleError) return true;
  const m = err instanceof Error ? err.message : String(err);
  return /status:\s*403/.test(m) || /not a viewer/i.test(m) || /access_denied/i.test(m);
}

/** Permanent: this wallet is not an ACL viewer of the handle (wrong wallet / no pay). */
export function isAuthDenied(err: unknown): boolean {
  const m = err instanceof Error ? err.message : String(err);
  return /is not authorized to decrypt/i.test(m) || /does not exist or user/i.test(m);
}

/**
 * Decrypt a confidential balance handle with the ~60s ACL-indexing-lag retry.
 * - transient gateway 403 -> retry (calls onWait with elapsed seconds)
 * - permanent auth denial -> DecryptDeniedError
 */
export async function decryptHandle(
  client: { decrypt: (h: Hex) => Promise<{ value: unknown }> },
  handle: Hex,
  onWait?: (secs: number) => void,
  attempts = 30,
  delayMs = 4000
): Promise<bigint> {
  const start = Date.now();
  let lastErr: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      const { value } = await client.decrypt(handle);
      return value as bigint;
    } catch (err) {
      lastErr = err;
      if (isAuthDenied(err)) throw new DecryptDeniedError();
      if (isTransientDecryptError(err) && i < attempts) {
        onWait?.(Math.round((Date.now() - start) / 1000));
        await sleep(delayMs);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

/** A balance handle of all-zero bytes means "no confidential balance yet". */
export function isZeroHandle(handle: string): boolean {
  try {
    return BigInt(handle) === 0n;
  } catch {
    return false;
  }
}
