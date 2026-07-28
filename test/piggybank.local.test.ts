/**
 * OPTIONAL local round-trip test — requires Docker Desktop.
 *
 * This proves the same encrypt -> compute -> decrypt cycle as
 * scripts/roundtrip.ts, but entirely locally: the Nox Hardhat plugin boots
 * the off-chain stack (Handle Gateway + KMS + Runner) in Docker containers
 * and etches NoxCompute into a simulated OP network. No Sepolia ETH needed.
 *
 * Run with:  npm run test:local     (make sure Docker Desktop is running)
 *
 * If you don't have Docker, skip this file — the Sepolia scripts are the
 * primary deliverable for the spike.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { nox } from "@iexec-nox/nox-hardhat-plugin";

describe("ConfidentialPiggyBank (local Nox stack)", () => {
  it("round-trips encrypt -> deposit -> decrypt", async () => {
    const { viem } = await nox.connect();
    const publicClient = await viem.getPublicClient();

    const piggy = await viem.deployContract("ConfidentialPiggyBank");

    const { handle, handleProof } = await nox.encryptInput(
      1000n,
      "uint256",
      piggy.address
    );

    const hash = await piggy.write.deposit([handle, handleProof]);
    await publicClient.waitForTransactionReceipt({ hash });

    const balanceHandle = (await piggy.read.balance()) as `0x${string}`;
    const { value } = await nox.decrypt(balanceHandle);

    assert.equal(value, 1000n);
  });
});
