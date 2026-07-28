/**
 * Deploy CipherPayToken (Nox ERC-7984 confidential token).
 *
 * Standalone ethers v6 script (run with tsx), mirroring your deployPayroll.ts.
 * Works on any Nox-supported network — the RPC's chainId decides. Nox supports
 * BOTH Ethereum Sepolia (11155111) and Arbitrum Sepolia (421614).
 *
 * Env vars (add to your existing .env):
 *   TOKEN_RPC_URL  - RPC for the target chain. Falls back to SEPOLIA_RPC_URL
 *                    (Ethereum Sepolia) if unset. For Arbitrum Sepolia, set this
 *                    to an Arbitrum Sepolia RPC.
 *   PRIVATE_KEY    - 0x-prefixed funded burner key (your existing one).
 *
 * Run:  npx hardhat compile   then   npx tsx scripts/deployToken.ts
 */
import "dotenv/config";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { JsonRpcProvider, Wallet, ContractFactory } from "ethers";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

function requireEnv(name: string, fallback?: string): string {
  const v = process.env[name] ?? (fallback ? process.env[fallback] : undefined);
  if (!v || v.trim() === "") {
    throw new Error(`Missing ${name}${fallback ? ` (or ${fallback})` : ""}. See .env.`);
  }
  return v.trim();
}

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
    } else if (entry === "CipherPayToken.json") {
      return full;
    }
  }
  return null;
}

const CHAINS: Record<string, string> = {
  "11155111": "Ethereum Sepolia",
  "421614": "Arbitrum Sepolia",
};

async function main() {
  const rpcUrl = requireEnv("TOKEN_RPC_URL", "SEPOLIA_RPC_URL");
  const pk = requireEnv("PRIVATE_KEY");

  const artifactPath = findArtifact(join(ROOT, "artifacts"));
  if (!artifactPath) throw new Error("CipherPayToken artifact not found. Run `npx hardhat compile` first.");
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));

  const provider = new JsonRpcProvider(rpcUrl);
  const wallet = new Wallet(pk, provider);
  const net = await provider.getNetwork();
  const chainName = CHAINS[net.chainId.toString()] ?? `chain ${net.chainId}`;

  console.log(`Owner   : ${wallet.address}`);
  console.log(`Network : ${chainName} (chainId ${net.chainId})`);
  if (!CHAINS[net.chainId.toString()]) {
    console.warn("WARNING: this chainId isn't a known Nox network (11155111 / 421614).");
  }

  const factory = new ContractFactory(artifact.abi, artifact.bytecode, wallet);
  console.log("Deploying CipherPayToken (constructor initialOwner = you)…");
  const token = await factory.deploy(wallet.address);
  await token.waitForDeployment();
  const address = await token.getAddress();

  console.log("");
  console.log("=====================================================");
  console.log(` CipherPayToken deployed to: ${address}`);
  console.log("=====================================================");

  writeFileSync(
    join(ROOT, "deployment.token.json"),
    JSON.stringify({ chainId: Number(net.chainId), network: chainName, address }, null, 2) + "\n"
  );
  console.log("\nSaved deployment.token.json");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});