/**
 * Deploy CipherPayToken + CipherPayrollTreasury (Arbitrum Sepolia or Ethereum Sepolia).
 *
 * Standalone ethers v6 script. The RPC's chainId decides the network; the Nox
 * library resolves NoxCompute per-chain automatically.
 *
 * Env vars:
 *   TOKEN_RPC_URL  - RPC for the target chain (falls back to SEPOLIA_RPC_URL).
 *                    For Arbitrum Sepolia, set this to an Arbitrum Sepolia RPC.
 *   PRIVATE_KEY    - funded burner key (employer / owner of both contracts).
 *
 * Run:  npx hardhat compile   then   npx tsx scripts/deployPayrollTreasury.ts
 */
import "dotenv/config";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { JsonRpcProvider, Wallet, ContractFactory } from "ethers";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const CHAINS: Record<string, string> = { "11155111": "Ethereum Sepolia", "421614": "Arbitrum Sepolia" };

function firstEnv(...names: string[]): string {
  for (const n of names) {
    const v = process.env[n];
    if (v && v.trim() !== "") return v.trim();
  }
  throw new Error(`Set one of: ${names.join(", ")} in .env.`);
}

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

async function main() {
  const rpcUrl = firstEnv("TOKEN_RPC_URL", "SEPOLIA_RPC_URL");
  const pk = firstEnv("PRIVATE_KEY");

  const provider = new JsonRpcProvider(rpcUrl);
  const owner = new Wallet(pk, provider);
  const net = await provider.getNetwork();
  const chainName = CHAINS[net.chainId.toString()] ?? `chain ${net.chainId}`;

  console.log(`Owner    : ${owner.address}`);
  console.log(`Network  : ${chainName} (chainId ${net.chainId})`);

  const tokenArtifact = loadArtifact("CipherPayToken.json");
  const treasuryArtifact = loadArtifact("CipherPayrollTreasury.json");

  console.log("Deploying CipherPayToken…");
  const token = await new ContractFactory(tokenArtifact.abi, tokenArtifact.bytecode, owner).deploy(owner.address);
  await token.waitForDeployment();
  const tokenAddr = await token.getAddress();
  console.log(`  token    : ${tokenAddr}`);

  console.log("Deploying CipherPayrollTreasury…");
  const treasury = await new ContractFactory(treasuryArtifact.abi, treasuryArtifact.bytecode, owner).deploy(
    tokenAddr,
    owner.address
  );
  await treasury.waitForDeployment();
  const treasuryAddr = await treasury.getAddress();
  console.log(`  treasury : ${treasuryAddr}`);

  writeFileSync(
    join(ROOT, "deployment.payroll-treasury.json"),
    JSON.stringify(
      { chainId: Number(net.chainId), network: chainName, token: tokenAddr, treasury: treasuryAddr },
      null,
      2
    ) + "\n"
  );
  console.log("\nSaved deployment.payroll-treasury.json");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});