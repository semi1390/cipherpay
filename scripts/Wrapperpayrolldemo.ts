/**
 * CipherPay REAL-MONEY payroll round-trip on Arbitrum Sepolia.
 *
 *   1. Deploy MockUSDC + CipherPayWrapper (cpUSD) + CipherPayrollTreasury.
 *   2. Mint real USDC to the owner, approve the wrapper, and WRAP it into the
 *      treasury (public deposit -> confidential balance).
 *   3. Run payroll: pay employees HIDDEN amounts of cpUSD in one tx.
 *   4. Each employee decrypts their own cpUSD balance.
 *   5. One employee UNWRAPS their pay back to real USDC:
 *        unwrap(...) -> publicDecrypt(handle) via the gateway -> finalizeUnwrap(...)
 *      and ends up holding real, spendable USDC.
 *
 * Proves: real ERC-20 in -> private while in payroll -> real ERC-20 out.
 *
 * Env: TOKEN_RPC_URL (falls back to SEPOLIA_RPC_URL), PRIVATE_KEY (funded owner).
 * Run: npx hardhat compile && npx tsx scripts/wrapperPayrollDemo.ts
 */
import "dotenv/config";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { JsonRpcProvider, Wallet, ContractFactory, Contract, parseEther } from "ethers";
import { createEthersHandleClient, NotYetComputedHandleError } from "@iexec-nox/handle";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
type Hex = `0x${string}`;

const USDC_ABI = [
  "function mint(address to, uint256 amount)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
];
const WRAPPER_ABI = [
  "function wrap(address to, uint256 amount) returns (bytes32)",
  "function unwrap(address from, address to, bytes32 encryptedAmount, bytes inputProof) returns (bytes32)",
  "function finalizeUnwrap(bytes32 unwrapRequestId, bytes decryptedAmountAndProof)",
  "function confidentialBalanceOf(address account) view returns (bytes32)",
  "function underlying() view returns (address)",
  "event UnwrapRequested(address indexed receiver, bytes32 amount)",
];
const TREASURY_ABI = [
  "function runPayroll(address[] employees, bytes32[] encryptedAmounts, bytes[] inputProofs) external",
];

const USDC = (n: number) => BigInt(n) * 1_000_000n; // 6 decimals
const fmt = (v: bigint) => `${(Number(v) / 1e6).toLocaleString()} USDC`;
const CHAINS: Record<string, { name: string; explorer: string }> = {
  "11155111": { name: "Ethereum Sepolia", explorer: "https://sepolia.etherscan.io" },
  "421614": { name: "Arbitrum Sepolia", explorer: "https://sepolia.arbiscan.io" },
};

function firstEnv(...names: string[]): string {
  for (const n of names) {
    const v = process.env[n];
    if (v && v.trim() !== "") return v.trim();
  }
  throw new Error(`Set one of: ${names.join(", ")} in .env.`);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function findArtifact(dir: string, name: string): string | null {
  let entries: string[] = [];
  try { entries = readdirSync(dir); } catch { return null; }
  for (const e of entries) {
    const full = join(dir, e);
    let isDir = false;
    try { isDir = readdirSync(full).length >= 0; } catch { isDir = false; }
    if (isDir) { const f = findArtifact(full, name); if (f) return f; }
    else if (e === name) return full;
  }
  return null;
}
function load(name: string) {
  const p = findArtifact(join(ROOT, "artifacts"), name);
  if (!p) throw new Error(`${name} not found. Run \`npx hardhat compile\` first.`);
  return JSON.parse(readFileSync(p, "utf8"));
}
function isTransient(err: unknown): boolean {
  if (err instanceof NotYetComputedHandleError) return true;
  const m = err instanceof Error ? err.message : String(err);
  return /status:\s*403/.test(m) || /not a viewer/i.test(m) || /access_denied/i.test(m) ||
    /is not authorized to decrypt/i.test(m) || /does not exist or user/i.test(m) ||
    /not.*publicly decryptable/i.test(m);
}
async function withRetry<T>(fn: () => Promise<T>, label: string, attempts = 30, delayMs = 4000): Promise<T> {
  const start = Date.now();
  let last: unknown;
  for (let i = 1; i <= attempts; i++) {
    try { return await fn(); }
    catch (err) {
      last = err;
      if (isTransient(err) && i < attempts) {
        console.log(`      [${label}] gateway not synced yet, retrying (${i}/${attempts}, ${Math.round((Date.now() - start) / 1000)}s) …`);
        await sleep(delayMs);
        continue;
      }
      throw err;
    }
  }
  throw last;
}

async function main() {
  const rpc = firstEnv("TOKEN_RPC_URL", "SEPOLIA_RPC_URL");
  const pk = firstEnv("PRIVATE_KEY");
  const provider = new JsonRpcProvider(rpc);
  const owner = new Wallet(pk, provider);
  const net = await provider.getNetwork();
  const chain = CHAINS[net.chainId.toString()];
  console.log(`Owner   : ${owner.address}`);
  console.log(`Network : ${chain?.name ?? `chain ${net.chainId}`} (chainId ${net.chainId})\n`);

  // --- 1) Deploy USDC + wrapper + treasury ---------------------------------
  const usdcArt = load("MockUSDC.json");
  const wrapArt = load("CipherPayWrapper.json");
  const treasuryArt = load("CipherPayrollTreasury.json");

  console.log("Deploying MockUSDC + CipherPayWrapper + CipherPayrollTreasury…");
  const usdc = await new ContractFactory(usdcArt.abi, usdcArt.bytecode, owner).deploy();
  await usdc.waitForDeployment();
  const usdcAddr = (await usdc.getAddress()) as Hex;
  const wrapper = await new ContractFactory(wrapArt.abi, wrapArt.bytecode, owner).deploy(usdcAddr);
  await wrapper.waitForDeployment();
  const wrapperAddr = (await wrapper.getAddress()) as Hex;
  const treasury = await new ContractFactory(treasuryArt.abi, treasuryArt.bytecode, owner).deploy(wrapperAddr, owner.address);
  await treasury.waitForDeployment();
  const treasuryAddr = (await treasury.getAddress()) as Hex;
  console.log(`  USDC     : ${usdcAddr}`);
  console.log(`  Wrapper  : ${wrapperAddr}`);
  console.log(`  Treasury : ${treasuryAddr}\n`);

  const usdcC = new Contract(usdcAddr, USDC_ABI, owner);
  const wrapperC = new Contract(wrapperAddr, WRAPPER_ABI, owner);
  const treasuryC = new Contract(treasuryAddr, TREASURY_ABI, owner);
  const ownerClient = await createEthersHandleClient(owner);

  // --- 2) Mint real USDC, approve, and WRAP into the treasury ---------------
  const FUND = USDC(1000);
  console.log(`Minting ${fmt(FUND)} to owner, approving, and wrapping into the treasury…`);
  await (await usdcC.mint(owner.address, FUND)).wait();
  await (await usdcC.approve(wrapperAddr, FUND)).wait();
  await (await wrapperC.wrap(treasuryAddr, FUND)).wait();
  console.log(`  treasury funded with wrapped USDC (deposit is public; balances are hidden)\n`);

  // --- 3) Run payroll (hidden amounts) -------------------------------------
  const roster = [
    { name: "Alice", wallet: Wallet.createRandom().connect(provider), amount: USDC(120) },
    { name: "Bob", wallet: Wallet.createRandom().connect(provider), amount: USDC(250) },
    { name: "Carol", wallet: Wallet.createRandom().connect(provider), amount: USDC(400) },
  ];
  console.log("Running payroll (each amount encrypted, one tx)…");
  {
    const addrs: string[] = [], handles: string[] = [], proofs: string[] = [];
    for (const e of roster) {
      const { handle, handleProof } = await ownerClient.encryptInput(e.amount, "uint256", treasuryAddr);
      addrs.push(e.wallet.address); handles.push(handle); proofs.push(handleProof);
    }
    const tx = await treasuryC.runPayroll(addrs, handles, proofs);
    await tx.wait();
    if (chain) console.log(`  paid ${roster.length} employees · ${chain.explorer}/tx/${tx.hash}\n`);
  }

  // --- 4) Employees decrypt their cpUSD balance ----------------------------
  console.log("Employees decrypt their own cpUSD balance (first success ~60s+):");
  for (const e of roster) {
    const client = await createEthersHandleClient(e.wallet);
    const handle = (await wrapperC.confidentialBalanceOf(e.wallet.address)) as Hex;
    const value = await withRetry(() => client.decrypt(handle).then((r) => r.value as bigint), e.name);
    console.log(`  ${e.name.padEnd(6)} ${fmt(value)} (expected ${fmt(e.amount)}) ${value === e.amount ? "OK" : "MISMATCH"}`);
  }

  // --- 5) One employee UNWRAPS back to real USDC ---------------------------
  const alice = roster[0];
  console.log(`\n${alice.name} unwraps her ${fmt(alice.amount)} back to real USDC:`);

  // Alice needs a little ETH for the two txs (unwrap + finalize).
  await (await owner.sendTransaction({ to: alice.wallet.address, value: parseEther("0.003") })).wait();

  const aliceClient = await createEthersHandleClient(alice.wallet);
  const aliceUsdc = new Contract(usdcAddr, USDC_ABI, alice.wallet);
  const aliceWrapper = new Contract(wrapperAddr, WRAPPER_ABI, alice.wallet);

  // (a) request unwrap of her amount (encrypted, bound to the wrapper)
  const enc = await aliceClient.encryptInput(alice.amount, "uint256", wrapperAddr);
  const unwrapTx = await aliceWrapper.unwrap(alice.wallet.address, alice.wallet.address, enc.handle, enc.handleProof);
  const rc = await unwrapTx.wait();
  const reqEvent = rc!.logs
    .map((l: unknown) => { try { return aliceWrapper.interface.parseLog(l as never); } catch { return null; } })
    .find((p: { name?: string } | null) => p?.name === "UnwrapRequested");
  const unwrapRequestId = reqEvent!.args.amount as Hex;
  console.log(`  unwrap requested (burned) · request handle ${unwrapRequestId.slice(0, 18)}…`);

  // (b) the gateway publicly decrypts the burned amount -> proof for finalize
  const { value: pubValue, decryptionProof } = await withRetry(
    () => aliceClient.publicDecrypt(unwrapRequestId),
    "publicDecrypt"
  );
  console.log(`  gateway public-decrypted the unwrap amount: ${fmt(pubValue as bigint)}`);

  // (c) finalize -> real USDC is transferred to Alice
  await (await aliceWrapper.finalizeUnwrap(unwrapRequestId, decryptionProof)).wait();
  const aliceReal = (await aliceUsdc.balanceOf(alice.wallet.address)) as bigint;
  console.log(`  Alice real USDC balance: ${fmt(aliceReal)} (expected ${fmt(alice.amount)})`);

  const ok = aliceReal === alice.amount;
  console.log("");
  console.log("=====================================================");
  if (ok) {
    console.log(` REAL-MONEY confidential payroll OK on ${chain?.name ?? `chain ${net.chainId}`}:`);
    console.log("  - real USDC wrapped into a confidential treasury");
    console.log("  - employees paid HIDDEN amounts of cpUSD, decrypted their own");
    console.log("  - Alice unwrapped her pay back to REAL, spendable USDC");
  } else {
    console.log(" MISMATCH — see values above.");
  }
  console.log("=====================================================");
  if (!ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});