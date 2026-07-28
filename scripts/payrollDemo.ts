/**
 * CipherPayroll end-to-end demo — runs on Ethereum Sepolia OR Arbitrum Sepolia.
 *
 * The Nox library resolves the correct NoxCompute address per chain (via
 * block.chainid), and the SDK resolves gateway/subgraph from the RPC's chainId,
 * so the same demo works on either network — only the RPC decides.
 *
 *   1. Deploy a fresh CipherPayroll (employer = PRIVATE_KEY).
 *   2. Employer encrypts a salary per employee and calls setSalary(...).
 *      Alice and Dave are given the SAME salary on purpose.
 *   3. ANTI-EQUALITY: show that Alice's and Dave's stored handles DIFFER even
 *      though their salaries are identical (this is the storage-leak fix).
 *   4. Each employee reads getMySalary() and decrypts it off-chain — Alice and
 *      Dave both decrypt to the same correct value, proving the salt nets out.
 *   5. Isolation: an employee cannot decrypt another's salary; nor can the employer.
 *
 * Decrypt reuses the gateway-indexing-lag retry (the on-chain grant is instant,
 * but the gateway authorizes off an indexed ACL that trails chain head ~60s+).
 * Decrypts run in parallel so the whole roster waits out the lag once.
 * Employees need NO gas (view call + gasless decrypt); only the employer pays gas.
 *
 * Env vars:
 *   RPC_URL       - RPC for the target chain. Falls back to SEPOLIA_RPC_URL
 *                   (Ethereum Sepolia). For Arbitrum Sepolia, set RPC_URL to an
 *                   Arbitrum Sepolia RPC.
 *   PRIVATE_KEY   - employer (funded on the target chain).
 * Run:  npx tsx scripts/payrollDemo.ts
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

// Nox-supported networks (label by chainId).
const CHAINS: Record<string, string> = {
  "11155111": "Ethereum Sepolia",
  "421614": "Arbitrum Sepolia",
};

const ABI = [
  "function setSalary(address employee, bytes32 encryptedSalary, bytes inputProof) external",
  "function getMySalary() view returns (bytes32)",
  "function isEmployee(address) view returns (bool)",
  "function employeeCount() view returns (uint256)",
  "function owner() view returns (address)",
  "event EmployeeAdded(address indexed employee)",
  "event SalarySet(address indexed employee, bytes32 salaryHandle)",
];

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    throw new Error(`Missing ${name}. Copy .env.example to .env and fill it in (see README.md).`);
  }
  return v.trim();
}

/** First defined env var among `names` (used so RPC_URL falls back to SEPOLIA_RPC_URL). */
function firstEnv(...names: string[]): string {
  for (const n of names) {
    const v = process.env[n];
    if (v && v.trim() !== "") return v.trim();
  }
  throw new Error(`Set one of: ${names.join(", ")} in .env.`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function findArtifact(dir: string): string | null {
  let entries: string[] = [];
  try { entries = readdirSync(dir); } catch { return null; }
  for (const entry of entries) {
    const full = join(dir, entry);
    let isDir = false;
    try { isDir = readdirSync(full).length >= 0; } catch { isDir = false; }
    if (isDir) {
      const found = findArtifact(full);
      if (found) return found;
    } else if (entry === "CipherPayroll.json") {
      return full;
    }
  }
  return null;
}

function isTransientDecryptError(err: unknown): boolean {
  if (err instanceof NotYetComputedHandleError) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /status:\s*403/.test(msg) ||
    /not a viewer/i.test(msg) ||
    /access_denied/i.test(msg) ||
    /is not authorized to decrypt/i.test(msg) ||
    /does not exist or user/i.test(msg)
  );
}

async function decryptWithRetry(
  client: { decrypt: (h: Hex) => Promise<{ value: unknown }> },
  handle: Hex,
  label: string,
  attempts = 30,
  delayMs = 4000
): Promise<unknown> {
  const startedAt = Date.now();
  let lastErr: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      const { value } = await client.decrypt(handle);
      return value;
    } catch (err) {
      lastErr = err;
      if (isTransientDecryptError(err) && i < attempts) {
        const secs = Math.round((Date.now() - startedAt) / 1000);
        console.log(`      [${label}] gateway ACL not synced yet, retrying (${i}/${attempts}, ${secs}s) ...`);
        await sleep(delayMs);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

async function expectDenied(
  client: { decrypt: (h: Hex) => Promise<{ value: unknown }> },
  handle: Hex,
  who: string
): Promise<void> {
  try {
    await client.decrypt(handle);
    throw new Error(`ISOLATION FAILURE: ${who} was able to decrypt a salary it should not access.`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/ISOLATION FAILURE/.test(msg)) throw err;
    console.log(`    ${who}: decryption DENIED as expected -> ${msg.split("\n")[0]}`);
  }
}

async function main() {
  const rpcUrl = firstEnv("RPC_URL", "SEPOLIA_RPC_URL");
  const employerKey = requireEnv("PRIVATE_KEY");

  const provider = new JsonRpcProvider(rpcUrl);
  const employer = new Wallet(employerKey, provider);

  const net = await provider.getNetwork();
  const chainName = CHAINS[net.chainId.toString()];
  if (!chainName) {
    console.warn(
      `WARNING: chainId ${net.chainId} is not a Nox network ` +
        `(11155111 Ethereum Sepolia / 421614 Arbitrum Sepolia).`
    );
  }

  // --- 1) Deploy a fresh CipherPayroll -------------------------------------
  const artifactPath = findArtifact(join(ROOT, "artifacts"));
  if (!artifactPath) {
    throw new Error("CipherPayroll artifact not found. Run `npx hardhat compile` first.");
  }
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));

  console.log(`Employer : ${employer.address}`);
  console.log(`Network  : ${chainName ?? `chain ${net.chainId}`} (chainId ${net.chainId})`);
  console.log("Deploying a fresh CipherPayroll ...");
  const factory = new ContractFactory(artifact.abi, artifact.bytecode, employer);
  const deployed = await factory.deploy();
  await deployed.waitForDeployment();
  const payrollAddress = (await deployed.getAddress()) as Hex;
  console.log(`Payroll  : ${payrollAddress}\n`);

  const payroll = new Contract(payrollAddress, ABI, employer);
  const employerClient = await createEthersHandleClient(employer);

  // --- 2) Employer sets encrypted salaries ---------------------------------
  // Alice and Dave get the SAME salary (100000) on purpose, to exercise the
  // anti-equality property. Bob and Carol differ.
  const roster = [
    { name: "Alice", wallet: Wallet.createRandom().connect(provider), salary: 100_000n },
    { name: "Bob", wallet: Wallet.createRandom().connect(provider), salary: 250_000n },
    { name: "Carol", wallet: Wallet.createRandom().connect(provider), salary: 400_000n },
    { name: "Dave", wallet: Wallet.createRandom().connect(provider), salary: 100_000n },
  ];

  console.log("Setting encrypted salaries (employer signs + pays gas):");
  for (const e of roster) {
    const { handle, handleProof } = await employerClient.encryptInput(e.salary, "uint256", payrollAddress);
    const tx = await payroll.setSalary(e.wallet.address, handle, handleProof);
    const rcpt = await tx.wait();
    console.log(`  ${e.name.padEnd(6)} ${e.wallet.address}  salary set (block ${rcpt?.blockNumber})`);
  }
  console.log(`Employees on payroll: ${await payroll.employeeCount()}\n`);

  // --- 3) ANTI-EQUALITY: stored handles must differ, even for equal salaries -
  // getMySalary() is a view call (instant, no gateway lag). Read each employee's
  // stored handle by binding a Contract to their wallet (so msg.sender is them).
  console.log("Stored handles (read from the contract, no decryption):");
  const handles: Record<string, Hex> = {};
  for (const e of roster) {
    const asEmployee = new Contract(payrollAddress, ABI, e.wallet);
    handles[e.name] = (await asEmployee.getMySalary()) as Hex;
    console.log(`  ${e.name.padEnd(6)} salary=${String(e.salary).padStart(6)}  handle=${handles[e.name]}`);
  }

  const uniqueHandles = new Set(Object.values(handles).map((h) => h.toLowerCase()));
  const aliceEqDave = handles["Alice"].toLowerCase() === handles["Dave"].toLowerCase();
  console.log("");
  console.log(`  Alice and Dave have the SAME salary (100000).`);
  console.log(`  Alice handle == Dave handle ? ${aliceEqDave}  (want: false)`);
  console.log(`  distinct handles: ${uniqueHandles.size}/${roster.length}  (want: ${roster.length})`);
  if (aliceEqDave || uniqueHandles.size !== roster.length) {
    throw new Error("ANTI-EQUALITY FAILURE: equal salaries produced colliding stored handles.");
  }
  console.log("  ANTI-EQUALITY OK: identical salaries produced distinct stored handles.\n");

  // --- 4) Each employee decrypts their own salary (in parallel) ------------
  console.log("Each employee decrypts their own salary (parallel; first success ~60s+):");
  const results = await Promise.all(
    roster.map(async (e) => {
      const client = await createEthersHandleClient(e.wallet);
      const value = await decryptWithRetry(client, handles[e.name], e.name);
      return { name: e.name, value, expected: e.salary };
    })
  );
  for (const r of results) {
    const ok = r.value === r.expected;
    console.log(`  ${r.name.padEnd(6)} decrypted=${r.value} expected=${r.expected} ${ok ? "OK" : "MISMATCH"}`);
    if (!ok) throw new Error(`Decrypted salary for ${r.name} did not match what was set.`);
  }
  console.log("  (Note: Alice and Dave both decrypt to 100000 — the per-employee salt nets out.)\n");

  // --- 5) Isolation checks (instant; denied by on-chain isViewer) ----------
  console.log("Isolation checks (these are SUPPOSED to be denied):");
  const aliceClient = await createEthersHandleClient(roster[0].wallet);
  await expectDenied(aliceClient, handles["Bob"], "Alice reading Bob's salary");
  await expectDenied(employerClient, handles["Alice"], "Employer reading Alice's salary");

  console.log("");
  console.log("=====================================================");
  console.log(` CipherPayroll demo OK on ${chainName ?? `chain ${net.chainId}`}:`);
  console.log("  - identical salaries -> DISTINCT stored handles (no equality leak)");
  console.log("  - each employee decrypted ONLY their own, correct salary");
  console.log("  - cross-employee and employer decryption were denied by ACL");
  console.log("=====================================================");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});