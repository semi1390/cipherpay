import { BrowserProvider, JsonRpcProvider, JsonRpcSigner, Contract, Interface, isAddress, Network, id, getAddress } from "ethers";
import { createEthersHandleClient, NotYetComputedHandleError } from "@iexec-nox/handle";

// ---- Ethereum Sepolia (Nox confidential payroll treasury lives here) ----
// (names kept for minimal churn; values target Ethereum Sepolia)
export const ARBITRUM_CHAIN_ID = 11155111n;
export const ARBITRUM_HEX = "0xaa36a7";
export const EXPLORER = "https://sepolia.etherscan.io";

export type Hex = `0x${string}`;

// Minimal ABIs (euint256/externalEuint256 are bytes32 at the ABI boundary).
export const TREASURY_ABI = [
  "function runPayroll(address[] employees, bytes32[] encryptedAmounts, bytes[] inputProofs) external",
  "function treasuryBalance() view returns (bytes32)",
  "function grantTreasuryView() external",
  "function batchCount() view returns (uint256)",
  "function token() view returns (address)",
  "function owner() view returns (address)",
  "event PayrollRun(uint256 indexed batchId, uint256 count)",
  "event EmployeePaid(uint256 indexed batchId, address indexed employee)",
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
  const net = Network.from(11155111);
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
              chainName: "Sepolia",
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
    if (net.chainId !== ARBITRUM_CHAIN_ID) throw new Error("Wallet is not on Ethereum Sepolia.");
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
  // Add headroom so a small base-fee drift between pricing and broadcast can't
  // reject the tx ("max fee per gas less than block base fee"). On Arbitrum the
  // fee cap is tiny, so 2x costs effectively nothing (you still pay base+priority).
  const bump = (v: bigint) => (v * 2n);
  if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
    overrides.maxFeePerGas = bump(feeData.maxFeePerGas);
    overrides.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
  } else if (feeData.gasPrice) {
    overrides.gasPrice = bump(feeData.gasPrice);
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

// ---- payroll history (via Arbiscan / Etherscan V2 logs API) -------------
// Arbitrum blocks are extremely fast and Alchemy's free tier caps eth_getLogs
// at a 10-block range, so scanning logs over RPC is impractical here. We read
// the contract's events from the Arbiscan (Etherscan V2) logs API, which returns
// the full history — with timestamps and tx hashes — in a single request.
export interface PayrollRunInfo {
  batchId: bigint;
  count: number;
  txHash: string;
  blockNumber: number;
  timestamp: number;
}
export interface EmployeePayInfo {
  batchId: bigint;
  employee: string;
  txHash: string;
  blockNumber: number;
  timestamp: number;
}

export class HistoryUnavailableError extends Error {
  constructor() {
    super("Payroll history needs an Arbiscan API key. Set VITE_ARBISCAN_API_KEY in .env (free from arbiscan.io / etherscan.io).");
    this.name = "HistoryUnavailableError";
  }
}

const ETHERSCAN_V2 = "https://api.etherscan.io/v2/api";
const CHAIN_ID = "11155111";
const TOPIC_PAYROLL_RUN = id("PayrollRun(uint256,uint256)");
const TOPIC_EMPLOYEE_PAID = id("EmployeePaid(uint256,address)");

interface RawLog {
  topics: string[];
  data: string;
  blockNumber: string;
  timeStamp: string;
  transactionHash: string;
}

async function arbiscanGetLogs(treasuryAddr: string, topic0: string, topic2?: string): Promise<RawLog[]> {
  const key = import.meta.env.VITE_ARBISCAN_API_KEY?.trim();
  if (!key) throw new HistoryUnavailableError();
  const params = new URLSearchParams({
    chainid: CHAIN_ID,
    module: "logs",
    action: "getLogs",
    address: treasuryAddr,
    topic0,
    fromBlock: "0",
    toBlock: "latest",
    page: "1",
    offset: "1000",
    apikey: key,
  });
  if (topic2) {
    params.set("topic0_2_opr", "and");
    params.set("topic2", topic2);
  }
  const res = await fetch(`${ETHERSCAN_V2}?${params.toString()}`);
  const json = await res.json();
  if (json.status === "0") {
    if (/no records/i.test(json.message || "")) return [];
    throw new Error(`Arbiscan: ${json.message || "error"}${typeof json.result === "string" ? ` — ${json.result}` : ""}`);
  }
  return (json.result as RawLog[]) ?? [];
}

const toInt = (hex: string) => parseInt(hex, 16);

/** All payroll runs (newest first). Amounts are never in events. Needs Arbiscan key. */
export async function fetchPayrollRuns(_readProvider: JsonRpcProvider, treasuryAddr: string): Promise<PayrollRunInfo[]> {
  const logs = await arbiscanGetLogs(treasuryAddr, TOPIC_PAYROLL_RUN);
  return logs
    .map((l) => ({
      batchId: BigInt(l.topics[1]),
      count: Number(BigInt(l.data && l.data !== "0x" ? l.data : "0x0")),
      txHash: l.transactionHash,
      blockNumber: toInt(l.blockNumber),
      timestamp: toInt(l.timeStamp),
    }))
    .sort((a, b) => b.blockNumber - a.blockNumber);
}

/** EmployeePaid events (newest first); pass `employee` to filter to one wallet. Needs Arbiscan key. */
export async function fetchEmployeePayments(
  _readProvider: JsonRpcProvider,
  treasuryAddr: string,
  employee?: string
): Promise<EmployeePayInfo[]> {
  const topic2 = employee ? "0x" + employee.toLowerCase().replace(/^0x/, "").padStart(64, "0") : undefined;
  const logs = await arbiscanGetLogs(treasuryAddr, TOPIC_EMPLOYEE_PAID, topic2);
  return logs
    .map((l) => ({
      batchId: BigInt(l.topics[1]),
      employee: getAddress("0x" + l.topics[2].slice(26)),
      txHash: l.transactionHash,
      blockNumber: toInt(l.blockNumber),
      timestamp: toInt(l.timeStamp),
    }))
    .sort((a, b) => b.blockNumber - a.blockNumber);
}

// ---- real-money wrapper (ERC20ToERC7984Wrapper) ------------------------
// The treasury's confidential token is a WRAPPER around a real ERC-20 (USDC).
// Wrapping deposits public USDC -> confidential balance; unwrapping burns the
// confidential balance and (after a gateway public-decrypt) releases real USDC.
export const WRAPPER_ABI = [
  "function wrap(address to, uint256 amount) returns (bytes32)",
  "function unwrap(address from, address to, bytes32 encryptedAmount, bytes inputProof) returns (bytes32)",
  "function finalizeUnwrap(bytes32 unwrapRequestId, bytes decryptedAmountAndProof)",
  "function confidentialBalanceOf(address account) view returns (bytes32)",
  "function underlying() view returns (address)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "event UnwrapRequested(address indexed receiver, bytes32 amount)",
];
export const USDC_ABI = [
  "function mint(address to, uint256 amount)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

export interface TokenMeta {
  wrapper: string;
  underlying: string;
  decimals: number;
  tokenSymbol: string; // e.g. cpUSD
  underlyingSymbol: string; // e.g. USDC
}

/** Reads wrapper + underlying metadata. Throws if the token is not a wrapper. */
export async function resolveTokenMeta(readProvider: JsonRpcProvider, wrapperAddr: string): Promise<TokenMeta> {
  const w = new Contract(wrapperAddr, WRAPPER_ABI, readProvider);
  const underlying = (await w.underlying()) as string; // reverts if not a wrapper
  const u = new Contract(underlying, USDC_ABI, readProvider);
  const [decimals, tokenSymbol, underlyingSymbol] = await Promise.all([
    w.decimals().then((d: bigint) => Number(d)).catch(() => 6),
    w.symbol().catch(() => "cpUSD"),
    u.symbol().catch(() => "USDC"),
  ]);
  return { wrapper: wrapperAddr, underlying, decimals, tokenSymbol, underlyingSymbol };
}

/** publicDecrypt with the ~60s gateway-indexing-lag retry. Returns the proof finalizeUnwrap needs. */
export async function publicDecryptWithRetry(
  client: Awaited<ReturnType<typeof makeHandleClient>>,
  handle: Hex,
  onWait?: (secs: number) => void,
  attempts = 40,
  delayMs = 4000
): Promise<{ value: bigint; decryptionProof: string }> {
  const start = Date.now();
  let last: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      const r = await client.publicDecrypt(handle);
      return { value: r.value as bigint, decryptionProof: r.decryptionProof };
    } catch (err) {
      last = err;
      const m = err instanceof Error ? err.message : String(err);
      const transient = isTransientDecryptError(err) || /not.*publicly decryptable/i.test(m);
      if (transient && i < attempts) {
        onWait?.(Math.round((Date.now() - start) / 1000));
        await sleep(delayMs);
        continue;
      }
      throw err;
    }
  }
  throw last;
}

/** Encrypt `amount`, submit an unwrap request, and return the request handle (from the event). */
export async function requestUnwrap(
  conn: Connection,
  wrapperAddr: string,
  client: Awaited<ReturnType<typeof makeHandleClient>>,
  amount: bigint
): Promise<{ unwrapRequestId: Hex; txHash: string }> {
  const enc = await client.encryptInput(amount, "uint256", wrapperAddr as Hex);
  const txHash = await sendTx(conn, wrapperAddr, WRAPPER_ABI, "unwrap", [
    conn.address,
    conn.address,
    enc.handle,
    enc.handleProof,
  ]);
  const receipt = await conn.readProvider.getTransactionReceipt(txHash);
  const iface = new Interface(WRAPPER_ABI);
  let unwrapRequestId: Hex | null = null;
  for (const log of receipt?.logs ?? []) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed?.name === "UnwrapRequested") {
        unwrapRequestId = parsed.args.amount as Hex;
        break;
      }
    } catch {
      /* not our event */
    }
  }
  if (!unwrapRequestId) throw new Error("Unwrap request submitted but the UnwrapRequested event wasn't found.");
  return { unwrapRequestId, txHash };
}

export async function finalizeUnwrapTx(conn: Connection, wrapperAddr: string, unwrapRequestId: Hex, decryptionProof: string): Promise<string> {
  return sendTx(conn, wrapperAddr, WRAPPER_ABI, "finalizeUnwrap", [unwrapRequestId, decryptionProof]);
}