# CipherPay — Nox Day-1 Spike

A minimal plumbing test that proves the [iExec Nox](https://docs.iex.ec/nox-protocol/getting-started/welcome)
toolchain works end-to-end: it deploys the Nox "Hello World" `ConfidentialPiggyBank`
to **Ethereum Sepolia** and runs a full **encrypt → compute → decrypt** round-trip
using the Nox JS SDK. This is *not* the payroll app — it exists only to confirm the
toolchain deploys and round-trips before real work starts.

## What's inside

- `contracts/ConfidentialPiggyBank.sol` — the Hello World contract, verbatim from the
  [Nox docs](https://docs.iex.ec/nox-protocol/getting-started/hello-world): an encrypted
  `euint256` balance, `deposit`/`withdraw` using `Nox.fromExternal` + `Nox.add`/`Nox.sub`,
  and `Nox.allowThis` + `Nox.allow` after every operation.
- `scripts/deploy.ts` — deploys the contract to Sepolia (ethers v6).
- `scripts/roundtrip.ts` — `encryptInput` → `deposit` → read `balance()` handle →
  `decrypt`, using `@iexec-nox/handle`.
- `test/piggybank.local.test.ts` — *optional* fully-local version of the round-trip that
  runs against the plugin's Docker off-chain stack (no Sepolia ETH needed).

## Prerequisites

- **Node.js 22 or newer** (`node --version`). The Nox Hardhat plugin requires it.
  Get it from https://nodejs.org.
- A **Sepolia RPC URL** and a **funded burner private key** (see the table below).
- **Docker Desktop** — *only* if you want to run the optional local test
  (`npm run test:local`). The deploy and the Sepolia round-trip do **not** need Docker.

## Environment variables

Copy `.env.example` to `.env` and fill these in:

| Variable           | Required for            | What it is / where to get it                                                                                                                 |
| ------------------ | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `SEPOLIA_RPC_URL`  | deploy + round-trip     | An Ethereum Sepolia JSON-RPC endpoint. Create a free key at [Alchemy](https://alchemy.com) or [Infura](https://infura.io), or use a public RPC. |
| `PRIVATE_KEY`      | deploy + round-trip     | `0x`-prefixed key of a **throwaway** dev wallet with a little Sepolia ETH. Fund it at the [Google Cloud Sepolia faucet](https://cloud.google.com/application/web3/faucet/ethereum/sepolia). Never use a key holding real funds. |
| `CONTRACT_ADDRESS` | round-trip only         | The address printed by `npm run deploy:sepolia` (also written to `deployment.json`). Paste it back into `.env` before the round-trip.          |
| `DEPOSIT_AMOUNT`   | optional                | Integer to deposit in the round-trip. Defaults to `1000`.                                                                                     |

## Run it (Windows PowerShell)

From an unzipped copy of this folder:

```powershell
# 1. Install dependencies
npm install

# 2. Create your .env from the template, then open it and fill in the values
Copy-Item .env.example .env
notepad .env

# 3. Compile the contract (pins Solidity 0.8.35 — see "Notes" below)
npx hardhat compile

# 4. Deploy to Sepolia. Copy the printed address into CONTRACT_ADDRESS in .env
npm run deploy:sepolia
notepad .env

# 5. Run the encrypt -> compute -> decrypt round-trip on Sepolia
npm run roundtrip:sepolia
```

A successful round-trip ends with:

```
 decrypted balance: 1000  (expected 1000)
Round-trip OK: encrypt -> compute -> decrypt succeeded on Sepolia.
```

> Tip: if you re-run the round-trip against the same deployed contract, the balance
> accumulates (2000, 3000, …). That's still a valid round-trip — deploy a fresh
> contract if you want to see exactly `1000` again.

### Optional: run the round-trip fully locally (needs Docker)

```powershell
# Make sure Docker Desktop is running first.
npm run test:local
```

The first run pulls the Nox off-chain service images and can take a while; later runs reuse them.

## Notes / gotchas (worth knowing for the real build)

- **Nox is pre-1.0 and evolving.** These packages are betas
  (`@iexec-nox/handle@0.1.0-beta.x`, `@iexec-nox/nox-hardhat-plugin@0.1.0`,
  `@iexec-nox/nox-protocol-contracts@0.2.x`) and the docs carry an "under development"
  banner. Versions are pinned in `package.json`; expect API drift and re-check the
  [live docs](https://docs.iex.ec/nox-protocol/) before upgrading.
- **There is no official `nox-hardhat-starter` repo.** This project is scaffolded by
  hand from the real packages: the Hardhat plugin, the contracts library, and the
  `@iexec-nox/handle` SDK.
- **The JS SDK package is `@iexec-nox/handle`** (the GitHub repo is named
  `nox-handle-sdk`, but that is not the install name).
- **Solidity is pinned to `0.8.35`**, because `Nox.sol` declares `pragma ^0.8.35`.
  The contract's own `^0.8.27` pragma (as shown in the docs) is compatible with a
  0.8.35 compiler; compiling *at* 0.8.27 would fail on the import.
- **The round-trip is not purely local.** `encryptInput`/`decrypt` are calls to Nox's
  hosted Handle Gateway + KMS (running in Intel TDX TEEs) for Sepolia. You need network
  access to that infrastructure, and your wallet must be ACL-authorized to decrypt —
  the piggy bank handles this via `Nox.allow(balance, owner)`.
- **Supported encrypt types today:** `bool`, `uint16`, `uint256`, `int16`, `int256`
  (more coming). This spike uses `uint256`.
- **NoxCompute address + canonical RPC:** the deploy relies on the NoxCompute contract
  already being live on Sepolia, which the Nox library targets automatically. The
  [Networks page](https://docs.iex.ec/nox-protocol/getting-started/networks) lists the
  exact NoxCompute address, canonical RPC, explorer, and faucet if you need them.

## Reference links

- Hello World: https://docs.iex.ec/nox-protocol/getting-started/hello-world
- Hardhat plugin guide: https://docs.iex.ec/nox-protocol/guides/build-confidential-smart-contracts/hardhat
- JS SDK (`@iexec-nox/handle`): https://docs.iex.ec/nox-protocol/references/js-sdk/getting-started
- Solidity library: https://docs.iex.ec/nox-protocol/references/solidity-library/getting-started
- GitHub org: https://github.com/iExec-Nox
