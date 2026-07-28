import { defineConfig } from "hardhat/config";
import hardhatToolboxViemPlugin from "@nomicfoundation/hardhat-toolbox-viem";
import noxPlugin from "@iexec-nox/nox-hardhat-plugin";
import "dotenv/config";

const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL ?? "";
const PRIVATE_KEY = process.env.PRIVATE_KEY ?? "";

// Hardhat 3 config. The Nox plugin auto-detects the viem toolbox (below)
// and, for `hardhat test`, boots a local off-chain stack in Docker and
// etches the NoxCompute contract into the simulated network.
//
// Solidity is pinned to 0.8.35 because @iexec-nox/nox-protocol-contracts
// (Nox.sol) declares `pragma solidity ^0.8.35`.
export default defineConfig({
  plugins: [hardhatToolboxViemPlugin, noxPlugin],
  solidity: "0.8.35",
  networks: {
    // Default local network used by the OPTIONAL `npm run test:local`
    // (see test/piggybank.local.test.ts). Requires Docker Desktop.
    default: {
      type: "edr-simulated",
      chainType: "op",
    },
    // Ethereum Sepolia. The deploy + round-trip scripts in this spike
    // talk to Sepolia through their own ethers provider built from
    // SEPOLIA_RPC_URL, so this entry is only used if you later invoke
    // Hardhat-native tooling against Sepolia.
    sepolia: {
      type: "http",
      chainType: "l1",
      url: SEPOLIA_RPC_URL,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
  },
});
