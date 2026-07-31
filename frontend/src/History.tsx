import { useEffect, useState } from "react";
import { fetchPayrollRuns, HistoryUnavailableError, EXPLORER, fullError, type Connection, type PayrollRunInfo } from "./nox";
import { History as HistoryIcon, Lock, ArrowUpRight, Ban, Spinner } from "./icons";

interface Props {
  conn: Connection;
  treasuryAddr: string;
}

export default function History({ conn, treasuryAddr }: Props) {
  const [runs, setRuns] = useState<PayrollRunInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsKey, setNeedsKey] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setRuns(null);
    setError(null);
    setNeedsKey(false);
    fetchPayrollRuns(conn.readProvider, treasuryAddr)
      .then((r) => !cancelled && setRuns(r))
      .catch((e) => {
        if (cancelled) return;
        if (e instanceof HistoryUnavailableError) setNeedsKey(true);
        else setError(fullError(e));
      });
    return () => {
      cancelled = true;
    };
  }, [treasuryAddr, conn.readProvider]);

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">Payroll history</h1>
        <p className="page-sub">
          Every run is a public, verifiable transaction — the amounts are encrypted.
        </p>
      </div>

      {needsKey ? (
        <div className="note accent">
          <HistoryIcon size={16} />
          <span>
            Payroll history needs a free Etherscan API key. Add <code>VITE_ARBISCAN_API_KEY</code> to your{" "}
            <code>.env</code> (get one at etherscan.io) and restart the dev server. Runs still happen
            on-chain — this only powers the history view.
          </span>
        </div>
      ) : error ? (
        <div className="note err">
          <Ban size={16} /> <span>Couldn't load history. {error}</span>
        </div>
      ) : runs === null ? (
        <div className="note accent">
          <Spinner size={16} className="spin" /> Loading payroll runs…
        </div>
      ) : runs.length === 0 ? (
        <div className="empty">No payroll runs yet. Run one from the Run Payroll page.</div>
      ) : (
        <div className="hlist">
          {runs.map((r) => (
            <div className="hitem" key={r.txHash + r.batchId.toString()}>
              <div className="hitem-badge">#{r.batchId.toString()}</div>
              <div className="hitem-main">
                <div className="hitem-title">
                  Payroll run · {r.count} {r.count === 1 ? "employee" : "employees"}
                </div>
                <div className="hitem-meta">
                  <span>{r.timestamp ? new Date(r.timestamp * 1000).toLocaleString() : `block ${r.blockNumber}`}</span>
                  <span className="hitem-hidden">
                    <Lock size={12} /> amounts encrypted
                  </span>
                </div>
              </div>
              <a
                className="hitem-link link"
                href={`${EXPLORER}/tx/${r.txHash}`}
                target="_blank"
                rel="noreferrer"
              >
                Etherscan <ArrowUpRight size={13} />
              </a>
            </div>
          ))}
        </div>
      )}

      {runs && runs.length > 0 && (
        <div style={{ marginTop: 16, fontSize: 12.5, color: "var(--muted)", display: "flex", gap: 8, alignItems: "center" }}>
          <HistoryIcon size={14} /> Open any run on Etherscan — the transaction is public, but the paid
          amounts never appear.
        </div>
      )}
    </div>
  );
}