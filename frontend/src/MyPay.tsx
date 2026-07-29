import { useEffect, useState } from "react";
import { Contract, parseUnits, formatUnits } from "ethers";
import {
  makeHandleClient,
  decryptHandle,
  DecryptDeniedError,
  isZeroHandle,
  fetchEmployeePayments,
  HistoryUnavailableError,
  requestUnwrap,
  publicDecryptWithRetry,
  finalizeUnwrapTx,
  WRAPPER_ABI,
  USDC_ABI,
  EXPLORER,
  fullError,
  type Connection,
  type TokenMeta,
  type Hex,
  type EmployeePayInfo,
} from "./nox";
import { Receipt, Coins, Eye, Lock, CheckCircle, ArrowUpRight, ArrowRight, Ban, Spinner } from "./icons";

interface Props {
  conn: Connection;
  treasuryAddr: string;
  meta: TokenMeta;
}

type Load =
  | { kind: "loading" }
  | { kind: "ready"; payments: EmployeePayInfo[]; balanceHandle: Hex; proofNote: string | null }
  | { kind: "nopay" }
  | { kind: "error"; message: string };

type Reveal =
  | { kind: "idle" }
  | { kind: "decrypting"; secs: number }
  | { kind: "revealed"; value: bigint }
  | { kind: "denied" }
  | { kind: "error"; message: string };

type Withdraw =
  | { kind: "idle" }
  | { kind: "working"; step: string; secs: number }
  | { kind: "done"; txHash: string }
  | { kind: "error"; message: string };

export default function MyPay({ conn, treasuryAddr, meta }: Props) {
  const dec = meta.decimals;
  const fmt = (v: bigint) => formatUnits(v, dec);
  const parseAmt = (s: string): bigint | null => {
    try {
      const v = parseUnits(s.trim(), dec);
      return v > 0n ? v : null;
    } catch {
      return null;
    }
  };

  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [reveal, setReveal] = useState<Reveal>({ kind: "idle" });
  const [usdc, setUsdc] = useState<bigint | null>(null);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdraw, setWithdraw] = useState<Withdraw>({ kind: "idle" });

  async function refreshUsdc() {
    try {
      const bal = (await new Contract(meta.underlying, USDC_ABI, conn.readProvider).balanceOf(conn.address)) as bigint;
      setUsdc(bal);
    } catch {
      setUsdc(null);
    }
  }

  useEffect(() => {
    let cancelled = false;
    setLoad({ kind: "loading" });
    setReveal({ kind: "idle" });
    setWithdraw({ kind: "idle" });
    refreshUsdc();
    (async () => {
      try {
        const wrapper = new Contract(meta.wrapper, WRAPPER_ABI, conn.readProvider);
        const balanceHandle = (await wrapper.confidentialBalanceOf(conn.address)) as Hex;
        if (cancelled) return;
        if (isZeroHandle(balanceHandle)) {
          setLoad({ kind: "nopay" });
          return;
        }
        let payments: EmployeePayInfo[] = [];
        let proofNote: string | null = null;
        try {
          payments = await fetchEmployeePayments(conn.readProvider, treasuryAddr, conn.address);
        } catch (e) {
          proofNote = e instanceof HistoryUnavailableError ? "nokey" : fullError(e);
        }
        if (cancelled) return;
        setLoad({ kind: "ready", payments, balanceHandle, proofNote });
      } catch (e) {
        if (!cancelled) setLoad({ kind: "error", message: fullError(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [treasuryAddr, meta.wrapper, conn.readProvider, conn.address]);

  async function onReveal(balanceHandle: Hex) {
    setReveal({ kind: "decrypting", secs: 0 });
    try {
      const client = await makeHandleClient(conn.signer, conn.readProvider);
      const value = await decryptHandle(client, balanceHandle, (secs) => setReveal({ kind: "decrypting", secs }));
      setReveal({ kind: "revealed", value });
      if (!withdrawAmount) setWithdrawAmount(fmt(value));
    } catch (e) {
      if (e instanceof DecryptDeniedError) return setReveal({ kind: "denied" });
      setReveal({ kind: "error", message: fullError(e) });
    }
  }

  async function onWithdraw() {
    const amount = parseAmt(withdrawAmount);
    if (amount === null) {
      setWithdraw({ kind: "error", message: `Enter a positive ${meta.underlyingSymbol} amount.` });
      return;
    }
    try {
      const client = await makeHandleClient(conn.signer, conn.readProvider);
      setWithdraw({ kind: "working", step: "Requesting withdrawal (encrypt + burn)…", secs: 0 });
      const { unwrapRequestId } = await requestUnwrap(conn, meta.wrapper, client, amount);

      setWithdraw({ kind: "working", step: "Gateway authorizing the withdrawal…", secs: 0 });
      const { decryptionProof } = await publicDecryptWithRetry(client, unwrapRequestId, (secs) =>
        setWithdraw({ kind: "working", step: "Gateway authorizing the withdrawal…", secs })
      );

      setWithdraw({ kind: "working", step: `Finalizing — sending ${meta.underlyingSymbol}…`, secs: 0 });
      const txHash = await finalizeUnwrapTx(conn, meta.wrapper, unwrapRequestId, decryptionProof);

      await refreshUsdc();
      setWithdraw({ kind: "done", txHash });
      setReveal({ kind: "idle" }); // balance changed; require a fresh reveal
    } catch (e) {
      setWithdraw({ kind: "error", message: fullError(e) });
    }
  }

  const withdrawing = withdraw.kind === "working";

  return (
    <div>
      <div className="page-head page-head-row">
        <div>
          <h1 className="page-title">My pay</h1>
          <p className="page-sub">Your confidential payslip · reveal and withdraw to {meta.underlyingSymbol}</p>
        </div>
        <span className="chip">
          <Coins size={13} /> {usdc !== null ? `${fmt(usdc)} ${meta.underlyingSymbol}` : "…"} in wallet
        </span>
      </div>

      {load.kind === "loading" ? (
        <div className="note accent">
          <Spinner size={16} className="spin" /> Loading your payslip…
        </div>
      ) : load.kind === "error" ? (
        <div className="note err">
          <Ban size={16} /> <span>{load.message}</span>
        </div>
      ) : load.kind === "nopay" ? (
        <div className="empty">No confidential pay found for this wallet on this payroll.</div>
      ) : (
        <div className="payslip">
          <div className="payslip-top">
            <span className="badge-icon">
              <Receipt size={18} />
            </span>
            <div>
              <div className="payslip-heading">You were paid</div>
              <div className="payslip-sub">
                {load.payments.length > 0
                  ? `${load.payments.length} confidential ${load.payments.length === 1 ? "payment" : "payments"} · verifiable on Arbiscan`
                  : "Confidential balance received"}
              </div>
            </div>
          </div>

          <div className="payslip-body">
            {load.payments.map((p) => (
              <div className="payslip-row" key={p.txHash + p.batchId.toString()}>
                <span className="k" style={{ fontFamily: "var(--font)" }}>
                  Run #{p.batchId.toString()} ·{" "}
                  {p.timestamp ? new Date(p.timestamp * 1000).toLocaleDateString() : `block ${p.blockNumber}`}
                </span>
                <a className="link" href={`${EXPLORER}/tx/${p.txHash}`} target="_blank" rel="noreferrer">
                  Proof <ArrowUpRight size={13} />
                </a>
              </div>
            ))}
            {load.proofNote && (
              <div className="payslip-row" style={{ borderBottom: 0 }}>
                <span className="k" style={{ fontFamily: "var(--font)", color: "var(--faint)" }}>
                  {load.proofNote === "nokey"
                    ? "Add VITE_ARBISCAN_API_KEY in .env to show proof-of-payment links."
                    : "Proof-of-payment links are unavailable right now."}
                </span>
              </div>
            )}

            {/* the amount — hidden until revealed */}
            <div className="payslip-amount">
              {reveal.kind === "revealed" ? (
                <>
                  <div className="reveal-label">
                    <Coins size={14} /> Your pay
                  </div>
                  <div className="reveal-amount">{fmt(reveal.value)}</div>
                  <div className="reveal-unit">{meta.tokenSymbol}</div>
                </>
              ) : reveal.kind === "decrypting" ? (
                <div className="decrypting" style={{ marginTop: 0, border: 0, background: "transparent", padding: 0 }}>
                  <div className="decrypting-head" style={{ justifyContent: "center" }}>
                    <span className="lockpulse">
                      <Lock size={18} />
                    </span>
                    <div>
                      <div className="decrypting-title">Decrypting your pay…</div>
                      <div className="decrypting-sub">Verifying your access — up to a minute after payday.</div>
                    </div>
                  </div>
                  <div className="progress" style={{ marginTop: 14 }}>
                    <div className="progress-bar" />
                  </div>
                  <div className="timer" style={{ textAlign: "center" }}>
                    elapsed {reveal.secs}s
                  </div>
                </div>
              ) : reveal.kind === "denied" ? (
                <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "center", color: "#f4a3b3", fontSize: 13 }}>
                  <Ban size={16} /> Only this employee can reveal this pay.
                </div>
              ) : reveal.kind === "error" ? (
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start", color: "#f4a3b3", fontSize: 13, wordBreak: "break-word" }}>
                  <Ban size={16} /> {reveal.message}
                </div>
              ) : (
                <>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--muted)", fontSize: 13, fontFamily: "var(--mono)" }}>
                    <Lock size={14} /> Amount encrypted on-chain
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <button className="btn btn-primary" onClick={() => onReveal(load.balanceHandle)}>
                      <Eye size={16} /> Reveal my pay
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* withdraw to real USDC */}
            {reveal.kind === "revealed" && withdraw.kind !== "done" && (
              <div style={{ marginTop: 16 }}>
                <div className="section-label" style={{ marginTop: 0 }}>
                  Withdraw to {meta.underlyingSymbol}
                </div>
                <div className="emp-row">
                  <input
                    className="input amt"
                    style={{ flex: 2 }}
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    inputMode="decimal"
                    disabled={withdrawing}
                    placeholder={`amount in ${meta.underlyingSymbol}`}
                  />
                  <button className="btn btn-primary" onClick={onWithdraw} disabled={withdrawing} style={{ flex: 1 }}>
                    {withdrawing ? (
                      <>
                        <Spinner size={16} className="spin" /> Withdrawing…
                      </>
                    ) : (
                      <>
                        Withdraw <ArrowRight size={15} />
                      </>
                    )}
                  </button>
                </div>
                <div style={{ marginTop: 8, fontSize: 12, color: "var(--muted)" }}>
                  Unwraps {meta.tokenSymbol} back to real {meta.underlyingSymbol}. The withdrawn amount becomes
                  public at withdrawal (that's the money leaving) — your remaining balance stays hidden.
                </div>
              </div>
            )}

            {withdraw.kind === "working" && (
              <div className="working" style={{ marginTop: 14 }}>
                <Spinner size={18} className="spin" />
                <div>
                  <div className="step">{withdraw.step}</div>
                  {withdraw.secs > 0 && <div className="sub">elapsed {withdraw.secs}s · waiting for gateway</div>}
                </div>
              </div>
            )}
            {withdraw.kind === "error" && (
              <div className="note err" style={{ marginTop: 14 }}>
                <Ban size={16} /> <span>{withdraw.message}</span>
              </div>
            )}
            {withdraw.kind === "done" && (
              <div className="reveal" style={{ marginTop: 16 }}>
                <div className="reveal-label">
                  <CheckCircle size={14} /> Withdrawn to your wallet
                </div>
                <div className="reveal-amount">{usdc !== null ? fmt(usdc) : "…"}</div>
                <div className="reveal-unit">{meta.underlyingSymbol} balance</div>
                <div className="reveal-note">
                  <a className="link" href={`${EXPLORER}/tx/${withdraw.txHash}`} target="_blank" rel="noreferrer">
                    View withdrawal on Arbiscan <ArrowUpRight size={13} />
                  </a>
                </div>
              </div>
            )}

            <div style={{ marginTop: 14, fontSize: 12, color: "var(--muted)", display: "flex", gap: 8, alignItems: "center", justifyContent: "center" }}>
              <CheckCircle size={13} /> Payment is public and verifiable · the amount is yours alone to reveal
            </div>
          </div>
        </div>
      )}
    </div>
  );
}