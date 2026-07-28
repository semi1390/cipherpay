/**
 * Deploy CipherPayroll to Ethereum Sepolia.
 *
 * Mirrors scripts/deploy.ts: a plain ethers v6 script (run with tsx) that reads
 * the ABI + bytecode from the artifact produced by `npx hardhat compile`.
 *
 * Env vars (see .env.example):
 *   SEPOLIA_RPC_URL  - an Ethereum Sepolia JSON-RPC endpoint
 *   PRIVATE_KEY      - 0x-prefixed key of a funded Sepolia dev wallet (the employer)
 *
 * Run:  npx tsx scripts/deployPayroll.ts
 */
import "dotenv/config";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { JsonRpcProvider, Wallet, ContractFactory } from "ethers";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    throw new Error(
      `Missing ${name}. Copy .env.example to .env and fill it in (see README.md).`
    );
  }
  return v.trim();
}

/** Recursively find CipherPayroll.json under artifacts/. */
function findArtifact(dir: string): string | null {
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return null;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    let isDir = false;
    try {
      isDir = readdirSync(full).length >= 0;
    } catch {
      isDir = false;
    }
    if (isDir) {
      const found = findArtifact(full);
      if (found) return found;
    } else if (entry === "CipherPayroll.json") {
      return full;
    }
  }
  return null;
}

async function main() {
  const rpcUrl = requireEnv("SEPOLIA_RPC_URL");
  const privateKey = requireEnv("PRIVATE_KEY");

  const artifactPath = findArtifact(join(ROOT, "artifacts"));
  if (!artifactPath) {
    throw new Error(
      "Could not find a compiled artifact for CipherPayroll.\n" +
        "Run `npx hardhat compile` first."
    );
  }
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
  if (!artifact.abi || !artifact.bytecode || artifact.bytecode === "0x") {
    throw new Error(`Artifact at ${artifactPath} has no deployable bytecode.`);
  }

  const provider = new JsonRpcProvider(rpcUrl);
  const wallet = new Wallet(privateKey, provider);

  const network = await provider.getNetwork();
  console.log(`Employer : ${wallet.address}`);
  console.log(`Network  : chainId ${network.chainId}`);
  if (network.chainId !== 11155111n) {
    console.warn(
      `WARNING: connected chainId is ${network.chainId}, not Sepolia (11155111). ` +
        `Check SEPOLIA_RPC_URL.`
    );
  }

  const factory = new ContractFactory(artifact.abi, artifact.bytecode, wallet);
  console.log("Deploying CipherPayroll ...");
  const contract = await factory.deploy();
  await contract.waitForDeployment();
  const address = await contract.getAddress();

  console.log("");
  console.log("=====================================================");
  console.log(` CipherPayroll deployed to: ${address}`);
  console.log("=====================================================");
  console.log("");
  console.log("Next: set salaries with the employer key, then have each employee");
  console.log("decrypt their own. See scripts/payrollDemo.ts for the full flow.");

  writeFileSync(
    join(ROOT, "deployment.payroll.json"),
    JSON.stringify(
      { network: "sepolia", chainId: Number(network.chainId), address },
      null,
      2
    ) + "\n"
  );
  console.log("\nSaved deployment.payroll.json");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});