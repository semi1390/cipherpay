/**
 * Deploy the "real money" payroll stack on Arbitrum Sepolia:
 *   MockUSDC (public ERC-20)  ->  CipherPayWrapper (confidential ERC-7984)  ->  CipherPayrollTreasury
 *
 * The treasury's confidential token is the WRAPPER, so payroll pays wrapped USDC
 * and employees can unwrap back to real USDC.
 *
 * Env: TOKEN_RPC_URL (falls back to SEPOLIA_RPC_URL), PRIVATE_KEY
 * Run: npx hardhat compile && npx tsx scripts/deployWrapperPayroll.ts
 */
import "dotenv/config";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { JsonRpcProvider, Wallet, ContractFactory, FetchRequest } from "ethers";

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
  // Longer per-request timeout: deploying the ~20KB wrapper can overrun ethers' default.
  const fr = new FetchRequest(rpc);
  fr.timeout = 120_000; // 120s
  const provider = new JsonRpcProvider(fr, undefined, { staticNetwork: true });
  const owner = new Wallet(pk, provider);
  const net = await provider.getNetwork();
  console.log(`Owner   : ${owner.address}`);
  console.log(`Network : ${CHAINS[net.chainId.toString()] ?? `chain ${net.chainId}`} (chainId ${net.chainId})`);

  const usdcArt = load("MockUSDC.json");
  const wrapArt = load("CipherPayWrapper.json");
  const treasuryArt = load("CipherPayrollTreasury.json");

  console.log("Deploying MockUSDC…");
  const usdc = await new ContractFactory(usdcArt.abi, usdcArt.bytecode, owner).deploy();
  await usdc.waitForDeployment();
  const usdcAddr = await usdc.getAddress();

  console.log("Deploying CipherPayWrapper…");
  const wrapper = await new ContractFactory(wrapArt.abi, wrapArt.bytecode, owner).deploy(usdcAddr);
  await wrapper.waitForDeployment();
  const wrapperAddr = await wrapper.getAddress();

  console.log("Deploying CipherPayrollTreasury…");
  const treasury = await new ContractFactory(treasuryArt.abi, treasuryArt.bytecode, owner).deploy(
    wrapperAddr,
    owner.address
  );
  await treasury.waitForDeployment();
  const treasuryAddr = await treasury.getAddress();

  console.log("\n=====================================================");
  console.log(` USDC     : ${usdcAddr}`);
  console.log(` Wrapper  : ${wrapperAddr}   (cpUSD — the treasury token)`);
  console.log(` Treasury : ${treasuryAddr}`);
  console.log("=====================================================");

  writeFileSync(
    join(ROOT, "deployment.wrapper-payroll.json"),
    JSON.stringify(
      { chainId: Number(net.chainId), usdc: usdcAddr, wrapper: wrapperAddr, treasury: treasuryAddr },
      null,
      2
    ) + "\n"
  );
  console.log("\nSaved deployment.wrapper-payroll.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});