/**
 * CipherPay confidential-token round-trip — the core payroll primitive.
 *
 *   1. Deploy a fresh CipherPayToken (owner = you).
 *   2. Owner MINTS a confidential balance to itself (amount encrypted in-browser/Node).
 *   3. Owner TRANSFERS a HIDDEN amount to an "employee" address (confidentialTransfer).
 *   4. The employee DECRYPTS its own confidential balance and confirms the amount —
 *      while the transfer amount is never visible in plaintext on-chain.
 *
 * Reuses the ACL-indexing-lag decrypt-retry from your roundtrip.ts: the on-chain
 * ACL grant is instant, but the Handle Gateway authorizes off an indexed copy that
 * trails chain head (~60s+), so decrypt retries the transient 403 until it syncs.
 *
 * Works on any Nox-supported chain (Ethereum Sepolia 11155111 or Arbitrum Sepolia
 * 421614) — the SDK resolves gateway/subgraph/NoxCompute from the RPC's chainId.
 *
 * Env vars:
 *   TOKEN_RPC_URL  - RPC for the target chain (falls back to SEPOLIA_RPC_URL).
 *   PRIVATE_KEY    - funded burner key (owner). Only the owner needs gas/funds;
 *                    the employee wallet is generated and needs nothing (balanceOf
 *                    is a view and decrypt is gasless).
 *
 * Run:  npx hardhat compile   then   npx tsx scripts/tokenDemo.ts
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

// Minimal ABI — declare only the 3-arg overloads so ethers has no ambiguity.
// externalEuint256 / euint256 are bytes32 at the ABI boundary.
const ABI = [
  "function mint(address to, bytes32 encryptedAmount, bytes inputProof) returns (bytes32)",
  "function confidentialTransfer(address to, bytes32 encryptedAmount, bytes inputProof) returns (bytes32)",
  "function confidentialBalanceOf(address account) view returns (bytes32)",
  "function owner() view returns (address)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
];

const MINT_AMOUNT = 1_000_000n;
const PAY_AMOUNT = 100_000n;

const CHAINS: Record<string, { name: string; explorer: string }> = {
  "11155111": { name: "Ethereum Sepolia", explorer: "https://sepolia.etherscan.io" },
  "421614": { name: "Arbitrum Sepolia", explorer: "https://sepolia.arbiscan.io" },
};

function requireEnv(name: string, fallback?: string): string {
  const v = process.env[name] ?? (fallback ? process.env[fallback] : undefined);
  if (!v || v.trim() === "") throw new Error(`Missing ${name}${fallback ? ` (or ${fallback})` : ""}. See .env.`);
  return v.trim();
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function findArtifact(dir: string): string | null {
  let entries: string[] = [];
  try { entries = readdirSync(dir); } catch { return null; }
  for (const entry of entries) {
    const full = join(dir, entry);
    let isDir = false;
    try { isDir = readdirSync(full).length >= 0; } catch { isDir = false; }
    if (isDir) { const f = findArtifact(full); if (f) return f; }
    else if (entry === "CipherPayToken.json") return full;
  }
  return null;
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
  const rpcUrl = requireEnv("TOKEN_RPC_URL", "SEPOLIA_RPC_URL");
  const pk = requireEnv("PRIVATE_KEY");

  const provider = new JsonRpcProvider(rpcUrl);
  const owner = new Wallet(pk, provider);
  const net = await provider.getNetwork();
  const chain = CHAINS[net.chainId.toString()];
  console.log(`Owner   : ${owner.address}`);
  console.log(`Network : ${chain?.name ?? `chain ${net.chainId}`} (chainId ${net.chainId})\n`);

  // --- 1) Deploy a fresh token ---------------------------------------------
  const artifactPath = findArtifact(join(ROOT, "artifacts"));
  if (!artifactPath) throw new Error("CipherPayToken artifact not found. Run `npx hardhat compile` first.");
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));

  console.log("Deploying a fresh CipherPayToken…");
  const factory = new ContractFactory(artifact.abi, artifact.bytecode, owner);
  const deployed = await factory.deploy(owner.address);
  await deployed.waitForDeployment();
  const tokenAddr = (await deployed.getAddress()) as Hex;
  console.log(`Token   : ${tokenAddr}\n`);

  const token = new Contract(tokenAddr, ABI, owner);
  const ownerClient = await createEthersHandleClient(owner);

  // A generated "employee" — needs no funds (view balance + gasless decrypt).
  const employee = Wallet.createRandom().connect(provider);
  console.log(`Employee: ${employee.address}\n`);

  // --- 2) Owner mints a confidential balance to itself ---------------------
  console.log(`Minting ${MINT_AMOUNT} (encrypted) to owner…`);
  {
    const { handle, handleProof } = await ownerClient.encryptInput(MINT_AMOUNT, "uint256", tokenAddr);
    const tx = await token.mint(owner.address, handle, handleProof);
    const rcpt = await tx.wait();
    console.log(`  mint confirmed (block ${rcpt?.blockNumber})`);
  }

  // --- 3) Owner transfers a HIDDEN amount to the employee ------------------
  console.log(`\nTransferring ${PAY_AMOUNT} (hidden) owner -> employee…`);
  let transferTx = "";
  {
    const { handle, handleProof } = await ownerClient.encryptInput(PAY_AMOUNT, "uint256", tokenAddr);
    const tx = await token.confidentialTransfer(employee.address, handle, handleProof);
    const rcpt = await tx.wait();
    transferTx = tx.hash;
    console.log(`  transfer confirmed (block ${rcpt?.blockNumber})`);
  }

  // --- What's on-chain is opaque -------------------------------------------
  const empBalHandle = (await token.confidentialBalanceOf(employee.address)) as Hex;
  const ownBalHandle = (await token.confidentialBalanceOf(owner.address)) as Hex;
  console.log("\nOn-chain balances are encrypted handles (opaque — no amounts):");
  console.log(`  employee balance handle: ${empBalHandle}`);
  console.log(`  owner    balance handle: ${ownBalHandle}`);
  if (chain) console.log(`  transfer tx: ${chain.explorer}/tx/${transferTx}  (Input Data shows no amount)`);

  // --- 4) Employee decrypts its own balance --------------------------------
  console.log("\nEmployee decrypts its own confidential balance (first success ~60s+):");
  const employeeClient = await createEthersHandleClient(employee);
  const empBalance = await decryptWithRetry(employeeClient, empBalHandle, "employee");
  console.log(`  employee decrypted balance: ${empBalance} (expected ${PAY_AMOUNT})`);

  // Owner decrypts its own remaining balance (proves the confidential math).
  const ownBalance = await decryptWithRetry(ownerClient, ownBalHandle, "owner");
  console.log(`  owner    decrypted balance: ${ownBalance} (expected ${MINT_AMOUNT - PAY_AMOUNT})`);

  const ok = empBalance === PAY_AMOUNT && ownBalance === MINT_AMOUNT - PAY_AMOUNT;
  console.log("");
  console.log("=====================================================");
  if (ok) {
    console.log(" Confidential token round-trip OK:");
    console.log("  - owner minted an encrypted balance");
    console.log("  - a HIDDEN amount moved owner -> employee (no amount on-chain)");
    console.log("  - the employee decrypted its own balance to the correct value");
  } else {
    console.log(" MISMATCH — see decrypted values above.");
  }
  console.log("=====================================================");
  if (!ok) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});