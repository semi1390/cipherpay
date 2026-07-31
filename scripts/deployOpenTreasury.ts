/**
 * Deploy ONLY a new (demo-open) CipherPayrollTreasury, reusing your EXISTING
 * CipherPayWrapper + MockUSDC on the same network. runPayroll is now callable by
 * anyone, so a judge can be their own employer end-to-end.
 *
 * Reads the wrapper/usdc from deployment.eth-sepolia.json (falls back to the
 * hard-coded Ethereum Sepolia addresses). Writes the NEW treasury back to it.
 *
 * Env: TOKEN_RPC_URL (falls back to SEPOLIA_RPC_URL), PRIVATE_KEY
 * Run: npx hardhat compile && npx tsx scripts/deployOpenTreasury.ts
 */
import "dotenv/config";
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { JsonRpcProvider, Wallet, ContractFactory, FetchRequest } from "ethers";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// Existing, already-deployed Ethereum Sepolia contracts (used if the json is missing).
const FALLBACK = {
  usdc: "0xE0B4D8dB739A1AEa23516Cad5d3A2804142d21eA",
  wrapper: "0xff32F741b4980F5185F715091E98c4357Ec51227",
};

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

async function main() {
  const rpc = firstEnv("TOKEN_RPC_URL", "SEPOLIA_RPC_URL");
  const pk = firstEnv("PRIVATE_KEY");
  const fr = new FetchRequest(rpc);
  fr.timeout = 120_000;
  const provider = new JsonRpcProvider(fr, undefined, { staticNetwork: true });
  const owner = new Wallet(pk, provider);
  const net = await provider.getNetwork();

  // resolve existing wrapper/usdc
  const jsonPath = join(ROOT, "deployment.eth-sepolia.json");
  let usdc = FALLBACK.usdc;
  let wrapper = FALLBACK.wrapper;
  if (existsSync(jsonPath)) {
    try {
      const j = JSON.parse(readFileSync(jsonPath, "utf8"));
      if (j.usdc) usdc = j.usdc;
      if (j.wrapper) wrapper = j.wrapper;
    } catch { /* use fallback */ }
  }

  console.log(`Owner    : ${owner.address}`);
  console.log(`Network  : chainId ${net.chainId}`);
  console.log(`Reusing  : USDC ${usdc}`);
  console.log(`Reusing  : Wrapper ${wrapper}`);
  console.log("Deploying NEW demo-open CipherPayrollTreasury…");

  const treasuryArt = load("CipherPayrollTreasury.json");
  const treasury = await new ContractFactory(treasuryArt.abi, treasuryArt.bytecode, owner).deploy(wrapper, owner.address);
  await treasury.waitForDeployment();
  const treasuryAddr = await treasury.getAddress();

  console.log("\n=====================================================");
  console.log(` NEW Treasury (open) : ${treasuryAddr}`);
  console.log(` Wrapper (unchanged) : ${wrapper}`);
  console.log(` USDC    (unchanged) : ${usdc}`);
  console.log("=====================================================");

  writeFileSync(
    jsonPath,
    JSON.stringify({ chainId: Number(net.chainId), usdc, wrapper, treasury: treasuryAddr, open: true }, null, 2) + "\n"
  );
  console.log("\nUpdated deployment.eth-sepolia.json with the new treasury.");
  console.log(`\nSet frontend VITE_TREASURY_ADDRESS=${treasuryAddr}`);
}

main().catch((e) => { console.error(e); process.exit(1); });