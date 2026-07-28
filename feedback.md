# Feedback on iExec Nox

Built **CipherPay**, a confidential payroll dApp, on Nox during the WTF Hackathon.
This is feedback from actually shipping an end-to-end app on Ethereum Sepolia:
contract + JS SDK + browser frontend. Overall Nox is genuinely impressive — writing
confidential logic in plain Solidity with `euint256` and getting real per-handle
access control is a great developer experience. Below is what worked well and what
tripped us up, in the spirit of helping the beta.

## What worked really well

- **Plain-Solidity confidentiality is the killer feature.** Swapping `uint256` for
  `euint256` and using `Nox.add`/`Nox.sub`/`fromExternal` felt natural. No new language,
  no separate circuit toolchain. The Hello World piggy bank maps cleanly onto real use
  cases.
- **Per-handle ACLs are powerful and intuitive.** `Nox.allow(handle, address)` +
  `Nox.allowThis(handle)` made per-employee salary isolation trivial to reason about:
  each employee decrypts only their own salary, and cross-reads are denied on-chain.
- **The SDK bundles in the browser with zero config.** `@iexec-nox/handle` uses Web
  Crypto (no Node built-ins), so a real `vite build` produced a clean bundle with no
  polyfills, no `define`, no `optimizeDeps` hacks. `createEthersHandleClient(new
  BrowserProvider(window.ethereum))` worked directly. This is a big deal for real dApps.

## What tripped us up (and how we worked around it)

1. **Decrypt fails with 403 "not a viewer" immediately after a write.**
   The on-chain `Nox.allow` grant is instant, but the Handle Gateway authorizes reads
   off an indexed copy of the ACL that lags chain head by ~60s+ on Sepolia. Our first
   round-trip died on the first decrypt. **Root cause took source-diving to find:** the
   SDK retries 404 (`NotYetComputedHandleError`) but *not* 403, so the lag surfaced as a
   generic "Unexpected response from Handle Gateway." **Suggestion:** document this ACL
   indexing lag prominently in the decrypt docs, and consider having the SDK optionally
   retry the 403/"not a viewer" case (or expose a helper that polls `viewACL` until the
   grant is indexed). This is the single biggest UX surprise for new builders.

2. **`viewACL` and the gateway lag differently.** We first gated decrypt on polling
   `viewACL` until the viewer appeared, but that subgraph lags *differently* than the
   gateway, so it burned time without predicting gateway readiness. Ended up relying on
   gateway-truth decrypt-retry instead. Clarifying in docs which surfaces are consistent
   with each other would help.

3. **NatSpec parses SDK package names as doc tags.** Putting `@iexec-nox/handle` inside a
   `///` Solidity comment caused `DocstringParsingError: Documentation tag @iexec-nox/handle
   not valid`. Minor, but worth a note in examples (use `//` when referencing package names).

4. **Compiler version is easy to miss.** `Nox.sol` is `pragma ^0.8.35`, so compiling at
   the docs' `^0.8.27` fails on the import. Would help to state "use solc 0.8.35+"
   explicitly in the Hello World page.

5. **Docs vs. reality drift (pre-1.0).** A few things differed from the docs/initial
   assumptions: there's no official `nox-hardhat-starter` repo, the SDK installs as
   `@iexec-nox/handle` (repo is `nox-handle-sdk`), and the stack needs Hardhat 3 / Node 22+.
   The "under development" banner is honest — pinning versions was essential.

## Suggestions, ranked

1. **Document the ~60s ACL indexing lag + the 403 retry pattern.** Biggest single win for
   new-builder success — everyone will hit this on their first decrypt.
2. **A working, minimal end-to-end starter** (contract + deploy + SDK round-trip, Hardhat 3)
   would save hours of scaffolding-by-hand.
3. **State solc 0.8.35+ and the exact package names on the Hello World page.**
4. **Consider an SDK helper** that abstracts "wait for ACL to be gateway-readable, then
   decrypt" — it's the pattern every app needs.

## Net

Despite the beta rough edges, we shipped a genuinely confidential payroll app end-to-end
on Sepolia in days — encrypted salaries, per-employee selective disclosure, all in plain
Solidity + a browser SDK. The core primitives are strong and the DX is close. Tightening
the decrypt/ACL-lag story in the docs and SDK would remove most of the friction we hit.