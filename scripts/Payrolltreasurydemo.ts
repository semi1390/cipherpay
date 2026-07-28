/**
 * CipherPay confidential payroll — end-to-end on Arbitrum Sepolia (or Ethereum Sepolia).
 *
 *   1. Deploy CipherPayToken + CipherPayrollTreasury (owner = you).
 *   2. FUND the treasury: mint an encrypted balance to the treasury contract.
 *   3. RUN PAYROLL: pay 3 employees HIDDEN amounts from the treasury in one tx
 *      (treasury.runPayroll), each amount encrypted per employee.
 *   4. Each employee receives real confidential tokens and DECRYPTS its own
 *      balance to confirm its pay — while amounts stay hidden on-chain.
 *   5. The owner decrypts the treasury's remaining balance (fund - total payout).
 *
 * Two different encryption bindings (important):
 *   - FUND amount is encrypted bound to the TOKEN   (token.mint validates against itself)
 *   - each PAY amount is encrypted bound to the TREASURY (treasury.runPayroll validates
 *     against itself, then transfers from its own balance)
 *
 * Reuses the ACL-indexing-lag decrypt-retry from roundtrip.ts. Employees need no
 * funds (view balance + gasless decrypt); only the owner pays gas.
 *
 * Env vars:  TOKEN_RPC_URL (falls back to SEPOLIA_RPC_URL), PRIVATE_KEY
 * Run:  npx hardhat compile   then   npx tsx scripts/payrollTreasuryDemo.ts
 */
import "dotenv/config";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { JsonRpcProvider, Wallet, ContractFactory, Contract } from "ethers";
import { createEthersHandleClient, NotYetComputedHandleError } from "@iexec-nox/handle";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
type Hex = `0x${string}`;

const TOKEN_ABI = [
  "function mint(address to, bytes32 encryptedAmount, bytes inputProof) returns (bytes32)",
  "function confidentialBalanceOf(address account) view returns (bytes32)",
  "function owner() view returns (address)",
];
const TREASURY_ABI = [
  "function runPayroll(address[] employees, bytes32[] encryptedAmounts, bytes[] inputProofs) external",
  "function treasuryBalance() view returns (bytes32)",
  "function batchCount() view returns (uint256)",
  "function token() view returns (address)",
];

const FUND_AMOUNT = 1_000_000n;
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
  for (const entry of entries) {
    const full = join(dir, entry);
    let isDir = false;
    try { isDir = readdirSync(full).length >= 0; } catch { isDir = false; }
    if (isDir) { const f = findArtifact(full, name); if (f) return f; }
    else if (entry === name) return full;
  }
  return null;
}
function loadArtifact(name: string) {
  const p = findArtifact(join(ROOT, "artifacts"), name);
  if (!p) throw new Error(`${name} not found. Run \`npx hardhat compile\` first.`);
  return JSON.parse(readFileSync(p, "utf8"));
}

function isTransientDecryptError(err: unknown): boolean {
  if (err instanceof NotYetComputedHandleError) return true;
  const m = err instanceof Error ? err.message : String(err);
  return (
    /status:\s*403/.test(m) ||
    /not a viewer/i.test(m) ||
    /access_denied/i.test(m) ||
    /is not authorized to decrypt/i.test(m) ||
    /does not exist or user/i.test(m)
  );
}
async function decryptWithRetry(
  client: { decrypt: (h: Hex) => Promise<{ value: unknown }> },
  handle: Hex,
  label: string,
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
      if (isTransientDecryptError(err) && i < attempts) {
        const secs = Math.round((Date.now() - start) / 1000);
        console.log(`      [${label}] gateway ACL not synced yet, retrying (${i}/${attempts}, ${secs}s) …`);
        await sleep(delayMs);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

async function main() {
  const rpcUrl = firstEnv("TOKEN_RPC_URL", "SEPOLIA_RPC_URL");
  const pk = firstEnv("PRIVATE_KEY");

  const provider = new JsonRpcProvider(rpcUrl);
  const owner = new Wallet(pk, provider);
  const net = await provider.getNetwork();
  const chain = CHAINS[net.chainId.toString()];
  console.log(`Owner    : ${owner.address}`);
  console.log(`Network  : ${chain?.name ?? `chain ${net.chainId}`} (chainId ${net.chainId})\n`);

  // --- 1) Deploy token + treasury ------------------------------------------
  const tokenArtifact = loadArtifact("CipherPayToken.json");
  const treasuryArtifact = loadArtifact("CipherPayrollTreasury.json");

  console.log("Deploying CipherPayToken + CipherPayrollTreasury…");
  const token = await new ContractFactory(tokenArtifact.abi, tokenArtifact.bytecode, owner).deploy(owner.address);
  await token.waitForDeployment();
  const tokenAddr = (await token.getAddress()) as Hex;
  const treasury = await new ContractFactory(treasuryArtifact.abi, treasuryArtifact.bytecode, owner).deploy(
    tokenAddr,
    owner.address
  );
  await treasury.waitForDeployment();
  const treasuryAddr = (await treasury.getAddress()) as Hex;
  console.log(`  token    : ${tokenAddr}`);
  console.log(`  treasury : ${treasuryAddr}\n`);

  const tokenC = new Contract(tokenAddr, TOKEN_ABI, owner);
  const treasuryC = new Contract(treasuryAddr, TREASURY_ABI, owner);
  const ownerClient = await createEthersHandleClient(owner);

  // --- 2) Fund the treasury (mint encrypted -> treasury) -------------------
  // Mint amount is bound to the TOKEN (token.mint validates against itself).
  console.log(`Funding treasury: minting ${FUND_AMOUNT} (encrypted) to the treasury…`);
  {
    const { handle, handleProof } = await ownerClient.encryptInput(FUND_AMOUNT, "uint256", tokenAddr);
    const tx = await tokenC.mint(treasuryAddr, handle, handleProof);
    const rcpt = await tx.wait();
    console.log(`  funded (block ${rcpt?.blockNumber})\n`);
  }

  // --- 3) Run payroll: pay employees hidden amounts ------------------------
  const roster = [
    { name: "Alice", wallet: Wallet.createRandom().connect(provider), amount: 120_000n },
    { name: "Bob", wallet: Wallet.createRandom().connect(provider), amount: 250_000n },
    { name: "Carol", wallet: Wallet.createRandom().connect(provider), amount: 400_000n },
  ];
  const payout = roster.reduce((a, e) => a + e.amount, 0n);

  console.log("Encrypting each pay amount (bound to the TREASURY) and running payroll in one tx…");
  const addrs: string[] = [];
  const handles: Hex[] = [];
  const proofs: string[] = [];
  for (const e of roster) {
    // Pay amounts are bound to the TREASURY (runPayroll validates against itself).
    const { handle, handleProof } = await ownerClient.encryptInput(e.amount, "uint256", treasuryAddr);
    addrs.push(e.wallet.address);
    handles.push(handle);
    proofs.push(handleProof);
  }
  {
    const tx = await treasuryC.runPayroll(addrs, handles, proofs);
    const rcpt = await tx.wait();
    console.log(`  payroll run (block ${rcpt?.blockNumber}); batch #${await treasuryC.batchCount()}`);
    if (chain) console.log(`  tx: ${chain.explorer}/tx/${tx.hash}  (Input Data shows no amounts)`);
  }

  // --- On-chain balances are opaque handles --------------------------------
  console.log("\nOn-chain balances are encrypted handles (no amounts visible):");
  const balHandles: Record<string, Hex> = {};
  for (const e of roster) {
    balHandles[e.name] = (await tokenC.confidentialBalanceOf(e.wallet.address)) as Hex;
    console.log(`  ${e.name.padEnd(6)} balance handle: ${balHandles[e.name]}`);
  }
  const treasuryBalHandle = (await treasuryC.treasuryBalance()) as Hex;
  console.log(`  Treasury balance handle: ${treasuryBalHandle}`);

  // --- 4) Each employee decrypts its own received pay (parallel) -----------
  console.log("\nEach employee decrypts its own confidential balance (first success ~60s+):");
  const results = await Promise.all(
    roster.map(async (e) => {
      const client = await createEthersHandleClient(e.wallet);
      const value = await decryptWithRetry(client, balHandles[e.name], e.name);
      return { name: e.name, value, expected: e.amount };
    })
  );
  let allOk = true;
  for (const r of results) {
    const ok = r.value === r.expected;
    allOk &&= ok;
    console.log(`  ${r.name.padEnd(6)} received=${r.value} expected=${r.expected} ${ok ? "OK" : "MISMATCH"}`);
  }

  // --- 5) Owner decrypts treasury remainder --------------------------------
  const treasuryLeft = await decryptWithRetry(ownerClient, treasuryBalHandle, "treasury");
  const expectedLeft = FUND_AMOUNT - payout;
  const treasuryOk = treasuryLeft === expectedLeft;
  console.log(`  Treasury remaining=${treasuryLeft} expected=${expectedLeft} ${treasuryOk ? "OK" : "MISMATCH"}`);

  console.log("");
  console.log("=====================================================");
  if (allOk && treasuryOk) {
    console.log(` Confidential payroll OK on ${chain?.name ?? `chain ${net.chainId}`}:`);
    console.log("  - treasury funded with an encrypted balance");
    console.log("  - 3 employees paid HIDDEN amounts in one payroll tx");
    console.log("  - each employee decrypted ONLY its own received pay");
    console.log("  - treasury remainder reconciles (fund - total payout)");
  } else {
    console.log(" MISMATCH — see values above.");
  }
  console.log("=====================================================");
  if (!(allOk && treasuryOk)) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});