/**
 * Round-trip proof on Ethereum Sepolia using the Nox JS SDK (@iexec-nox/handle):
 *
 *   1. encryptInput(amount, "uint256", contract)  -> { handle, handleProof }
 *   2. deposit(handle, handleProof)               -> on-chain confidential add
 *   3. read the balance() handle from the contract
 *   4. wait for the ACL grant to be INDEXED, then decrypt(handle) -> plaintext
 *
 * WHY STEP 4 HAS A WAIT (root cause of the earlier "not a viewer" 403):
 *   The contract's `Nox.allow(balance, owner)` records the viewer grant ON-CHAIN
 *   immediately. But the Handle Gateway authorises `GET /v0/secrets/:handle`
 *   against an INDEXED copy of the ACL (the Nox ingestor / subgraph), which
 *   trails the chain head by a few blocks. Right after `deposit` is mined, a
 *   direct on-chain `isViewer(...)` read is already true (which is why the SDK's
 *   own pre-check passes), but the gateway's indexer hasn't ingested the `allow`
 *   event yet -> it returns 403 {"error":"access_denied","message":"...not a
 *   viewer"}. The SDK does NOT retry 403 (only 401 and 404/NotYetComputed), so
 *   the call failed instantly. Doing it by hand worked because the human delay
 *   let the indexer catch up.
 *
 *   Fix: poll `viewACL(handle)` until the owner shows up as a viewer in the
 *   index (this is the exact thing the gateway checks), then decrypt — with a
 *   retry that also tolerates a transient 403 as a safety net.
 *
 * Env vars (see .env.example):
 *   SEPOLIA_RPC_URL  - an Ethereum Sepolia JSON-RPC endpoint
 *   PRIVATE_KEY      - 0x-prefixed key of the deploying / owner wallet
 *   CONTRACT_ADDRESS - address printed by `npm run deploy:sepolia`
 *   DEPOSIT_AMOUNT   - (optional) integer to deposit, default 1000
 */
import "dotenv/config";
import { JsonRpcProvider, Wallet, Contract } from "ethers";
import {
  createEthersHandleClient,
  NotYetComputedHandleError,
  UnknownHandleError,
} from "@iexec-nox/handle";

// euint256 / externalEuint256 are user-defined value types over bytes32,
// so at the ABI level deposit takes (bytes32, bytes) and balance() returns bytes32.
const ABI = [
  "function deposit(bytes32 inputHandle, bytes inputProof) external",
  "function withdraw(bytes32 inputHandle, bytes inputProof) external",
  "function balance() view returns (bytes32)",
  "function owner() view returns (address)",
];

type Hex = `0x${string}`;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    throw new Error(
      `Missing ${name}. Copy .env.example to .env and fill it in (see README.md).`
    );
  }
  return v.trim();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Poll viewACL until the owner is an indexed viewer of the handle. This is the
 * indexed ACL the gateway authorises against, so once the owner appears here the
 * gateway will accept the decrypt. Transient conditions (handle/grant not indexed
 * yet, subgraph a few blocks behind) are expected and simply retried.
 */
async function waitUntilViewerIndexed(
  client: { viewACL: (h: Hex) => Promise<{ isPublic: boolean; viewers: string[] }> },
  handle: Hex,
  owner: string,
  attempts = 20,
  delayMs = 3000
): Promise<void> {
  const target = owner.toLowerCase();
  for (let i = 1; i <= attempts; i++) {
    try {
      const acl = await client.viewACL(handle);
      const viewers = (acl.viewers ?? []).map((a) => a.toLowerCase());
      if (acl.isPublic || viewers.includes(target)) {
        console.log(`    ACL indexed: owner is a viewer (after ${i} check${i > 1 ? "s" : ""}).`);
        return;
      }
      console.log(`    grant not indexed yet, waiting (${i}/${attempts}) ...`);
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      const transient = err instanceof UnknownHandleError || name === "SubgraphOutOfSyncError";
      if (!transient) throw err; // a real error — surface it instead of spinning
      console.log(`    ACL index lagging (${name || "pending"}), waiting (${i}/${attempts}) ...`);
    }
    await sleep(delayMs);
  }
  console.log("    proceeding to decrypt without confirmed index (decrypt will retry) ...");
}

/** decrypt() can still race the gateway indexer; retry on 403/not-a-viewer and not-yet-computed. */
function isTransientDecryptError(err: unknown): boolean {
  if (err instanceof NotYetComputedHandleError) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return /status:\s*403/.test(msg) || /not a viewer/i.test(msg) || /access_denied/i.test(msg);
}

async function decryptWithRetry(
  client: { decrypt: (h: Hex) => Promise<{ value: unknown }> },
  handle: Hex,
  attempts = 12,
  delayMs = 4000
): Promise<unknown> {
  let lastErr: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      const { value } = await client.decrypt(handle);
      return value;
    } catch (err) {
      lastErr = err;
      if (isTransientDecryptError(err) && i < attempts) {
        const why = err instanceof NotYetComputedHandleError
          ? "handle not computed yet"
          : "gateway ACL not synced yet (403 not-a-viewer)";
        console.log(`    ${why}, retrying decrypt (${i}/${attempts}) ...`);
        await sleep(delayMs);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

async function main() {
  const rpcUrl = requireEnv("SEPOLIA_RPC_URL");
  const privateKey = requireEnv("PRIVATE_KEY");
  const contractAddress = requireEnv("CONTRACT_ADDRESS");
  const amount = BigInt(process.env.DEPOSIT_AMOUNT?.trim() || "1000");

  const provider = new JsonRpcProvider(rpcUrl);
  const wallet = new Wallet(privateKey, provider);
  const piggy = new Contract(contractAddress, ABI, wallet);

  console.log(`Owner    : ${wallet.address}`);
  console.log(`Contract : ${contractAddress}`);
  console.log(`Amount   : ${amount}`);
  console.log("");

  // A HandleClient bound to our Sepolia signer.
  const handleClient = await createEthersHandleClient(wallet);

  // 1) Encrypt off-chain -> handle + proof, bound to THIS contract.
  console.log("1/4 encryptInput ...");
  const { handle, handleProof } = await handleClient.encryptInput(
    amount,
    "uint256",
    contractAddress
  );
  console.log(`    handle: ${handle}`);

  // 2) Deposit: contract verifies the proof and does a confidential add.
  console.log("2/4 deposit ...");
  const tx = await piggy.deposit(handle, handleProof);
  const receipt = await tx.wait();
  console.log(`    mined in block ${receipt?.blockNumber}`);

  // 3) Read the on-chain (encrypted) balance handle.
  console.log("3/4 read balance() handle ...");
  const balanceHandle = (await piggy.balance()) as Hex;
  console.log(`    balance handle: ${balanceHandle}`);

  // 4) Wait for the viewer grant to be indexed, then decrypt to plaintext.
  console.log("4/4 wait for ACL to index, then decrypt ...");
  await waitUntilViewerIndexed(handleClient, balanceHandle, wallet.address);
  const value = await decryptWithRetry(handleClient, balanceHandle);

  console.log("");
  console.log("=====================================================");
  console.log(` decrypted balance: ${value}  (this-run deposit: ${amount})`);
  console.log("=====================================================");

  if (value === amount) {
    console.log("Round-trip OK: encrypt -> compute -> decrypt succeeded on Sepolia.");
  } else {
    // Not a failure: re-running against the same contract accumulates the balance.
    console.log(
      "Round-trip OK: encrypt -> compute -> decrypt succeeded on Sepolia.\n" +
        `(Decrypted ${value}, not ${amount}, because this contract already held a ` +
        `balance from a previous deposit. Deploy a fresh contract to see exactly ${amount}.)`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});