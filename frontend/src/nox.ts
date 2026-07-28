import { BrowserProvider, JsonRpcProvider, JsonRpcSigner, isAddress, Network } from "ethers";
import { createEthersHandleClient, NotYetComputedHandleError } from "@iexec-nox/handle";

export const SEPOLIA_CHAIN_ID = 11155111n;
export const SEPOLIA_HEX = "0xaa36a7";
export const EXPLORER = "https://sepolia.etherscan.io";

// Minimal ABI matching CipherPayroll (same interactions the Node scripts use).
// euint256 / externalEuint256 are bytes32 at the ABI boundary.
export const PAYROLL_ABI = [
  "function owner() view returns (address)",
  "function setSalary(address employee, bytes32 encryptedSalary, bytes inputProof) external",
  "function getMySalary() view returns (bytes32)",
  "function isEmployee(address) view returns (bool)",
  "function employeeCount() view returns (uint256)",
  "event EmployeeAdded(address indexed employee)",
  "event SalarySet(address indexed employee, bytes32 salaryHandle)",
];

export type Hex = `0x${string}`;

/** Address configured via frontend/.env (copied from deployment.payroll.json). */
export function getConfiguredAddress(): string | null {
  const a = import.meta.env.VITE_CONTRACT_ADDRESS?.trim();
  return a && isAddress(a) ? a : null;
}

export function getInjected(): NonNullable<Window["ethereum"]> {
  const eth = window.ethereum;
  if (!eth) throw new Error("No injected wallet found. Install MetaMask (or another EIP-1193 wallet).");
  return eth;
}

/**
 * Dedicated Sepolia read RPC (same endpoint your Node scripts use). The SDK does
 * on-chain reads through the provider we hand it; injected wallet RPCs are often
 * unreliable for eth_call, so we READ here and only SIGN with the wallet.
 */
export function getReadProvider(): JsonRpcProvider {
  const url = import.meta.env.VITE_SEPOLIA_RPC_URL;
  if (!url) {
    throw new Error(
      "Missing VITE_SEPOLIA_RPC_URL. Create frontend/.env with your Sepolia RPC " +
        "(same URL as SEPOLIA_RPC_URL in your scripts). See .env.example."
    );
  }
  // batchMaxCount: 1 disables JSON-RPC request batching. ethers v6 batches
  // multiple calls into one array POST by default, and some RPC endpoints
  // return 404 for batched requests — which surfaces as ethers' confusing
  // "could not coalesce error". Sending one request at a time avoids it.
  // staticNetwork pins the chain so ethers never re-probes eth_chainId/blockNumber.
  const sepolia = Network.from("sepolia");
  return new JsonRpcProvider(url, sepolia, { staticNetwork: sepolia, batchMaxCount: 1 });
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
  if (net.chainId !== SEPOLIA_CHAIN_ID) {
    try {
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: SEPOLIA_HEX }] });
    } catch (err: unknown) {
      const code = (err as { code?: number })?.code;
      if (code === 4902) {
        await eth.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: SEPOLIA_HEX,
              chainName: "Ethereum Sepolia",
              nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
              rpcUrls: ["https://rpc.sepolia.org"],
              blockExplorerUrls: [EXPLORER],
            },
          ],
        });
      } else {
        throw new Error("Please switch your wallet to Ethereum Sepolia to continue.");
      }
    }
    provider = new BrowserProvider(eth);
    net = await provider.getNetwork();
    if (net.chainId !== SEPOLIA_CHAIN_ID) throw new Error("Wallet is not on Ethereum Sepolia.");
  }

  const signer = await provider.getSigner();
  const address = await signer.getAddress();
  const readProvider = getReadProvider();
  return { provider, signer, readProvider, address, chainId: net.chainId };
}

/**
 * Signer-shaped object the SDK accepts: READS via dedicated RPC (`provider`),
 * SIGNING via the wallet. The SDK's SignerAdapter uses `signer.provider` for
 * reads and `signer` for getAddress/signTypedData.
 */
function makeHybridSigner(walletSigner: JsonRpcSigner, readProvider: JsonRpcProvider) {
  return {
    provider: readProvider,
    getAddress: () => walletSigner.getAddress(),
    signTypedData: (domain: unknown, types: unknown, value: unknown) =>
      walletSigner.signTypedData(domain as never, types as never, value as never),
  };
}

/** Nox HandleClient: reads via dedicated RPC, signs via the wallet. */
export async function makeHandleClient(walletSigner: JsonRpcSigner, readProvider: JsonRpcProvider) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createEthersHandleClient(makeHybridSigner(walletSigner, readProvider) as any);
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

/** Permanent authorization denial thrown by the SDK's on-chain isViewer check. */
export class DecryptDeniedError extends Error {
  constructor() {
    super("Not authorized to decrypt this handle.");
    this.name = "DecryptDeniedError";
  }
}

/** Transient: gateway hasn't indexed the ACL grant yet, or handle not computed. */
export function isTransientDecryptError(err: unknown): boolean {
  if (err instanceof NotYetComputedHandleError) return true;
  const m = err instanceof Error ? err.message : String(err);
  return /status:\s*403/.test(m) || /not a viewer/i.test(m) || /access_denied/i.test(m);
}

/** Permanent: the connected wallet is not an ACL viewer of this handle. */
export function isAuthDenied(err: unknown): boolean {
  const m = err instanceof Error ? err.message : String(err);
  return /is not authorized to decrypt/i.test(m) || /does not exist or user/i.test(m);
}

/**
 * Decrypt a salary handle with the ACL-indexing-lag retry (mirrors payrollDemo.ts).
 * - transient 403 / not-yet-computed -> retry (calls onWait with elapsed seconds)
 * - permanent auth denial -> throw DecryptDeniedError (UI shows "not authorized")
 */
export async function decryptSalary(
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