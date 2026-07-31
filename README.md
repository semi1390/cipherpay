# CipherPay — Confidential Payroll, On-Chain

**Real USDC in. Salaries paid privately. Real USDC out.** Every payment is publicly verifiable on-chain — every amount stays encrypted.

Built on [iExec Nox](https://docs.iex.ec/nox-protocol) confidential smart contracts (ERC-7984) on **Ethereum Sepolia**.

- 🌐 **Live app:** https://cipherpay-delta.vercel.app
- 🎥 **Demo video:** _[link coming soon]_
- 📜 **Deployed on:** Ethereum Sepolia (chainId 11155111)

---

## The problem

On-chain payroll is instant, global, and verifiable — but today it leaks every salary. Anyone can open a block explorer and see exactly what each employee earns. For any real company, that's a dealbreaker. Payroll is supposed to be private.

## The solution

CipherPay is confidential payroll where **payments stay publicly verifiable but the amounts are hidden**. Salaries are encrypted end-to-end — only the employee can decrypt their own pay.

The full loop, all working on live testnet:

```
Real USDC  →  wrap into confidential treasury  →  run payroll (hidden amounts, one tx)
     →  each employee reveals only their own pay  →  withdraw back to real USDC
```

Money goes in as real (test) USDC, moves through payroll with every amount encrypted, and comes back out as real, spendable USDC. No play tokens, no mocks.

---

## What makes CipherPay different

| | CipherPay |
|---|---|
| **Real money in and out** | USDC is wrapped, used for payroll, then unwrapped back to real USDC — a complete round-trip, not a hidden number in a database. |
| **Self-paying treasury** | The contract holds and pays from its **own** confidential balance via `allowTransient` — no per-payment operator approvals. |
| **Anti-equality protection** | Identical salaries produce **different** on-chain ciphertexts, so an observer can't infer who earns the same by comparing storage. |
| **Precise privacy model** | Individual salaries are private; treasury funding and withdrawals are public. "Salaries private, aggregate auditable" — the model real companies actually want. |

---

## What's public vs. what's private

| Public (verifiable on Etherscan) | Private (encrypted, holder-only) |
|---|---|
| That a payroll run happened | How much each employee was paid |
| Number of employees in a run | Each employee's confidential balance |
| Treasury funding amount (money entering) | The treasury's live encrypted balance* |
| Withdrawal amounts (money leaving) | Salary comparisons between employees |

\* The treasury owner can decrypt the treasury balance for auditing; the public cannot.

---

## How it works

```
┌────────────┐   wrap    ┌──────────────────┐   runPayroll   ┌───────────────┐
│  MockUSDC  │ ────────► │  cpUSD (ERC-7984)│ ─────────────► │   Employees   │
│  (ERC-20)  │           │  confidential    │  hidden amts   │  (encrypted   │
└────────────┘           │  treasury        │  in one tx     │   balances)   │
                         └──────────────────┘                └───────┬───────┘
                                                                     │ reveal (holder-only)
                                                                     │ unwrap → publicDecrypt
                                                                     ▼ → finalizeUnwrap
                                                              ┌───────────────┐
                                                              │  Real USDC    │
                                                              │  in wallet    │
                                                              └───────────────┘
```

- **Confidential token (ERC-7984):** balances and transfer amounts are opaque handles (`euint256`) — no amount appears on-chain.
- **Per-holder ACL:** the token grants each holder decrypt access to their own balance automatically; nobody else can read it.
- **Treasury payout:** `runPayroll` pays multiple employees hidden amounts in a single transaction, transferring from the treasury's own confidential balance.
- **Withdrawal:** an employee unwraps confidential tokens back to real USDC via a two-step gateway flow (`unwrap → publicDecrypt → finalizeUnwrap`) — the withdrawn amount becomes public at withdrawal (money leaving), while the remaining balance stays hidden.

---

## Deployed contracts (Ethereum Sepolia)

| Contract | Address |
|---|---|
| Treasury | [`0x220dF2553818B82540d1E758473E7d83Fb6F03Cf`](https://sepolia.etherscan.io/address/0x220dF2553818B82540d1E758473E7d83Fb6F03Cf) |
| Wrapper / cpUSD | [`0xff32F741b4980F5185F715091E98c4357Ec51227`](https://sepolia.etherscan.io/address/0xff32F741b4980F5185F715091E98c4357Ec51227) |
| MockUSDC | [`0xE0B4D8dB739A1AEa23516Cad5d3A2804142d21eA`](https://sepolia.etherscan.io/address/0xE0B4D8dB739A1AEa23516Cad5d3A2804142d21eA) |

> `MockUSDC` is a test stand-in for real USDC (real USDC only exists on mainnet). The wrapper accepts **any** ERC-20, so on mainnet you point it at canonical USDC and nothing else changes.

---

## The product (5 pages, live)

- **Landing** — the privacy pitch and the before/after of on-chain payroll.
- **Dashboard** — payroll stats and the encrypted treasury balance (owner-only reveal).
- **Run Payroll** — get test USDC → wrap → pay employees hidden amounts in one run.
- **History** — every payroll run, publicly verifiable, with 🔒 encrypted amounts and Etherscan links.
- **My Pay** — an employee reveals only their own pay, then withdraws back to real USDC.

---

## Run it locally

**Prerequisites:** Node 22+, an Ethereum Sepolia RPC (e.g. Alchemy), a free [Etherscan API key](https://etherscan.io/apis) (for the History page), and a browser wallet (MetaMask).

```bash
git clone https://github.com/semi1390/cipherpay.git
cd cipherpay/frontend
npm install
cp .env.example .env   # then fill in the values below
npm run dev            # http://localhost:5173
```

**Environment variables** (`frontend/.env`):

```
VITE_ARBITRUM_RPC_URL=<your Ethereum Sepolia RPC URL>
VITE_TREASURY_ADDRESS=0x220dF2553818B82540d1E758473E7d83Fb6F03Cf
VITE_ARBISCAN_API_KEY=<your Etherscan API key>   # History page reads run events
```

> The `VITE_ARBITRUM_RPC_URL` / `VITE_ARBISCAN_API_KEY` names are legacy from an earlier Arbitrum deployment — the **values** target Ethereum Sepolia and Etherscan. Connect MetaMask on **Ethereum Sepolia** (chainId 11155111).

**Contract demo scripts** (deploy + confidential round-trip) from the repo root:

```bash
npm install
# set SEPOLIA_RPC_URL (Ethereum Sepolia) + PRIVATE_KEY in the root .env
npx hardhat compile
npx tsx scripts/deployWrapperPayroll.ts   # deploy MockUSDC + CipherPayWrapper + Treasury
npx tsx scripts/wrapperPayrollDemo.ts     # full round-trip: wrap USDC → hidden payroll → each employee decrypts → unwrap back to real USDC
```

> ⚠️ **Use a throwaway/burner wallet** funded only with Ethereum Sepolia testnet ETH. Never put the private key of a wallet holding real funds into `.env`.

---

## Built on iExec Nox

CipherPay uses the Nox confidential stack meaningfully at its core — it is not a superficial integration:

- **Confidential ERC-7984 token** (`@iexec-nox/nox-confidential-contracts`) with `euint256` encrypted balances — the payroll currency itself, plus the `ERC20ToERC7984Wrapper` that bridges real USDC.
- **Nox Library** (`euint256`, `fromExternal`, `allowTransient`, `allowPublicDecryption`, `publicDecrypt`, per-holder ACL) for the self-paying confidential treasury and the unwrap-to-USDC flow.
- **`@iexec-nox/handle` JS SDK** for in-browser encryption and holder-only decryption, wired directly into the frontend.
- Deployed and running against Nox's **Handle Gateway + indexer** on Ethereum Sepolia.

Without Nox's confidential execution, hidden-amount payroll on a public chain isn't possible — the confidentiality is the product, not a feature bolted on top.

---

## What was newly built vs. reused

**Newly built during the hackathon (from scratch):**
- `CipherPayrollTreasury` — a self-paying confidential treasury with batch hidden payouts in one transaction.
- `CipherPayWrapper` (cpUSD) — a Nox ERC-7984 confidential token backed 1:1 by real USDC (wrap / unwrap).
- `MockUSDC` — a test USDC stand-in for the underlying ERC-20.
- The USDC wrap → payroll → unwrap round-trip and the two-step gateway withdrawal (`unwrap → publicDecrypt → finalizeUnwrap`).
- The anti-equality salting scheme.
- The full 5-page frontend with in-browser Nox encryption/decryption.

**Reused / relied on:** the iExec Nox protocol, its confidential-contracts library, and the `@iexec-nox/handle` SDK (all used as intended, not modified).

---

## Privacy model (honest note)

CipherPay hides **individual salary amounts** and **each employee's balance**. It does **not** hide that payroll happened, how many employees were paid, or the total funding/withdrawal amounts (money entering and leaving is public). This is deliberate: "salaries private, aggregate auditable" is exactly what a real company wants — confidentiality between employees, with a verifiable public trail for the treasury.

The anti-equality salting prevents inferring equal salaries from storage, but does not defeat a targeted known-plaintext guess against a specific address (a fully non-reproducible salt would require an off-chain secret — a noted design boundary).

---

## Tech stack

Solidity 0.8.35 · iExec Nox (ERC-7984, `euint256`) · Hardhat 3 · TypeScript · React + Vite · ethers v6 · `@iexec-nox/handle` · Ethereum Sepolia · Vercel.

## Roadmap / next steps

- Real USDC on Ethereum mainnet (swap MockUSDC for canonical USDC).
- Recurring / scheduled payroll runs.
- Multi-token payroll and employee-side spending integrations.
- Employer-delegated auditor access (grant a specific auditor decrypt rights to totals).

---

## License

MIT — see [LICENSE](./LICENSE).