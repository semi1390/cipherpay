# CipherPay — Confidential Payroll, On-Chain

**Real USDC in. Salaries paid privately. Real USDC out.** Every payment is publicly verifiable on-chain — every amount stays encrypted.

Built on [iExec Nox](https://docs.iex.ec/nox-protocol) confidential smart contracts (ERC-7984) on **Arbitrum Sepolia**.

- 🌐 **Live app:** https://cipherpay-delta.vercel.app
- 🎥 **Demo video:** _[link coming soon]_
- 📜 **Deployed on:** Arbitrum Sepolia (chainId 421614)

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

| Public (verifiable on Arbiscan) | Private (encrypted, holder-only) |
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

## Deployed contracts (Arbitrum Sepolia)

| Contract | Address |
|---|---|
| Treasury | [`0x261fb2B3ce89a9cAfFd05d3cCF9Ed24AF2199c4A`](https://sepolia.arbiscan.io/address/0x261fb2B3ce89a9cAfFd05d3cCF9Ed24AF2199c4A) |
| Wrapper / cpUSD | [`0xC0591392714F020Cbc54386553c0F35F3ebBA0Bb`](https://sepolia.arbiscan.io/address/0xC0591392714F020Cbc54386553c0F35F3ebBA0Bb) |
| MockUSDC | [`0x220dF2553818B82540d1E758473E7d83Fb6F03Cf`](https://sepolia.arbiscan.io/address/0x220dF2553818B82540d1E758473E7d83Fb6F03Cf) |

---

## The product (5 pages, live)

- **Landing** — the privacy pitch and the before/after of on-chain payroll.
- **Dashboard** — payroll stats and the encrypted treasury balance (owner-only reveal).
- **Run Payroll** — get test USDC → wrap → pay employees hidden amounts in one run.
- **History** — every payroll run, publicly verifiable, with 🔒 encrypted amounts and Arbiscan links.
- **My Pay** — an employee reveals only their own pay, then withdraws back to real USDC.

---

## Run it locally

**Prerequisites:** Node 22+, an Arbitrum Sepolia RPC (e.g. Alchemy), and a browser wallet (MetaMask).

```bash
git clone https://github.com/semi1390/cipherpay.git
cd cipherpay/frontend
npm install
cp .env.example .env   # then fill in the values below
npm run dev
```

**Environment variables** (`frontend/.env`):

```
VITE_RPC_URL=<your Arbitrum Sepolia RPC URL>
VITE_ARBISCAN_API_KEY=<your Arbiscan API key>   # used by the History page to read run events
# (plus the deployed contract addresses if not hard-coded — see .env.example)
```

To run the contract demo scripts (deploy + confidential round-trip) from the repo root:

```bash
npm install
# set SEPOLIA_RPC_URL / RPC_URL + PRIVATE_KEY in the root .env
npx hardhat compile
npx tsx scripts/tokenDemo.ts      # confidential token: mint → hidden transfer → decrypt
npx tsx scripts/treasuryDemo.ts   # full payroll: fund → hidden batch payouts → employees decrypt
```

> ⚠️ **Use a throwaway/burner wallet** funded only with Arbitrum Sepolia testnet ETH. Never put the private key of a wallet holding real funds into `.env`.

---

## Built on iExec Nox

CipherPay uses the Nox confidential stack meaningfully at its core — it is not a superficial integration:

- **Confidential ERC-7984 token** (`@iexec-nox/nox-confidential-contracts`) with `euint256` encrypted balances — the payroll currency itself.
- **Nox Library** (`euint256`, `fromExternal`, `allowTransient`, per-holder ACL) for the self-paying confidential treasury.
- **`@iexec-nox/handle` JS SDK** for in-browser encryption and holder-only decryption, wired directly into the frontend.
- Deployed and running against Nox's **Handle Gateway + indexer** on Arbitrum Sepolia.

Without Nox's confidential execution, hidden-amount payroll on a public chain isn't possible — the confidentiality is the product, not a feature bolted on top.

---

## What was newly built vs. reused

**Newly built during the hackathon (from scratch):**
- `CipherPayToken` — a Nox ERC-7984 confidential payroll token.
- `CipherPayrollTreasury` — a self-paying confidential treasury with batch hidden payouts.
- The USDC wrap → payroll → unwrap round-trip and the two-step gateway withdrawal.
- The anti-equality salting scheme.
- The full 5-page frontend with in-browser Nox encryption/decryption.

**Reused / relied on:** the iExec Nox protocol, its confidential-contracts library, and the `@iexec-nox/handle` SDK (all used as intended, not modified).

---

## Privacy model (honest note)

CipherPay hides **individual salary amounts** and **each employee's balance**. It does **not** hide that payroll happened, how many employees were paid, or the total funding/withdrawal amounts (money entering and leaving is public). This is deliberate: "salaries private, aggregate auditable" is exactly what a real company wants — confidentiality between employees, with a verifiable public trail for the treasury.

The anti-equality salting prevents inferring equal salaries from storage, but does not defeat a targeted known-plaintext guess against a specific address (a fully non-reproducible salt would require an off-chain secret — a noted design boundary).

---

## Tech stack

Solidity 0.8.35 · iExec Nox (ERC-7984, `euint256`) · Hardhat 3 · TypeScript · React + Vite · ethers v6 · `@iexec-nox/handle` · Arbitrum Sepolia · Vercel.

## Roadmap / next steps

- Real USDC on Arbitrum mainnet (swap MockUSDC for canonical USDC).
- Recurring / scheduled payroll runs.
- Multi-token payroll and employee-side spending integrations.
- Employer-delegated auditor access (grant a specific auditor decrypt rights to totals).

---

## License

MIT — see [LICENSE](./LICENSE).