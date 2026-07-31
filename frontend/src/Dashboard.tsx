import { useEffect, useState } from "react";
import { Contract, formatUnits } from "ethers";
import {
  makeHandleClient,
  sendTx,
  decryptHandle,
  DecryptDeniedError,
  isZeroHandle,
  fetchPayrollRuns,
  fetchEmployeePayments,
  TREASURY_ABI,
  shortAddr,
  fullError,
  type Connection,
  type Hex,
  type TokenMeta,
} from "./nox";
import { Coins, Grid, Users, TrendingUp, Lock, Eye, Shield, Ban, Spinner, ArrowRight } from "./icons";

interface Props {
  conn: Connection;
  treasuryAddr: string;
  meta: TokenMeta;
  onNavigate: (p: "run") => void;
}

type Reveal =
  | { kind: "hidden" }
  | { kind: "empty" }
  | { kind: "working"; step: string; secs: number }
  | { kind: "revealed"; value: bigint }
  | { kind: "denied" }
  | { kind: "error"; message: string };

export default function Dashboard({ conn, treasuryAddr, meta, onNavigate }: Props) {
  const [owner, setOwner] = useState<string | null>(null);
  const isOwner = owner !== null && owner.toLowerCase() === conn.address.toLowerCase();

  const [stats, setStats] = useState<{ runs: number; employees: number | null; lastRun: number | null } | null>(null);
  const [balanceHandle, setBalanceHandle] = useState<Hex | null>(null);
  const [reveal, setReveal] = useState<Reveal>({ kind: "hidden" });

  useEffect(() => {
    let cancelled = false;
    const treasury = new Contract(treasuryAddr, TREASURY_ABI, conn.readProvider);
    (async () => {
      try {
        // Core reads over RPC — these must work regardless of history availability.
        const [o, runsCount, balHandle] = await Promise.all([
          treasury.owner() as Promise<string>,
          treasury.batchCount() as Promise<bigint>,
          treasury.treasuryBalance() as Promise<Hex>,
        ]);
        if (cancelled) return;
        setOwner(o);
        setBalanceHandle(balHandle);
        setReveal(isZeroHandle(balHandle) ? { kind: "empty" } : { kind: "hidden" });
        setStats({ runs: Number(runsCount), employees: null, lastRun: null });

        // Richer stats from event history (Etherscan) — best effort.
        try {
          const [runs, pays] = await Promise.all([
            fetchPayrollRuns(conn.readProvider, treasuryAddr),
            fetchEmployeePayments(conn.readProvider, treasuryAddr),
          ]);
          if (cancelled) return;
          const distinct = new Set(pays.map((p) => p.employee.toLowerCase())).size;
          setStats({
            runs: Number(runsCount),
            employees: distinct,
            lastRun: runs.length ? runs[0].timestamp : null,
          });
        } catch {
          /* history unavailable (no Etherscan key) — keep run count from batchCount */
        }
      } catch (e) {
        if (!cancelled) setReveal({ kind: "error", message: fullError(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [treasuryAddr, conn.readProvider, conn.address]);

  async function revealTreasury() {
    if (!balanceHandle) return;
    setReveal({ kind: "working", step: "Decrypting…", secs: 0 });
    try {
      const client = await makeHandleClient(conn.signer, conn.readProvider);
      const onWait = (secs: number) => setReveal({ kind: "working", step: "Decrypting…", secs });
      let value: bigint;
      try {
        value = await decryptHandle(client, balanceHandle, onWait);
      } catch (e) {
        // If the owner hasn't been granted view yet, grant it then retry.
        if (e instanceof DecryptDeniedError && isOwner) {
          setReveal({ kind: "working", step: "Granting owner view…", secs: 0 });
          await sendTx(conn, treasuryAddr, TREASURY_ABI, "grantTreasuryView", []);
          value = await decryptHandle(client, balanceHandle, onWait);
        } else {
          throw e;
        }
      }
      setReveal({ kind: "revealed", value });
    } catch (e) {
      if (e instanceof DecryptDeniedError) {
        setReveal({ kind: "denied" });
        return;
      }
      setReveal({ kind: "error", message: fullError(e) });
    }
  }

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-sub">Confidential treasury · {shortAddr(conn.address)}</p>
      </div>

      <div className="stats">
        <div className="stat">
          <div className="stat-k">
            <Grid size={14} /> Payroll runs
          </div>
          <div className="stat-v">{stats ? stats.runs : "—"}</div>
        </div>
        <div className="stat">
          <div className="stat-k">
            <Users size={14} /> Employees paid
          </div>
          <div className="stat-v">{stats ? (stats.employees ?? "—") : "—"}</div>
        </div>
        <div className="stat">
          <div className="stat-k">
            <TrendingUp size={14} /> Last run
          </div>
          <div className="stat-v small">
            {!stats
              ? "—"
              : stats.employees === null
                ? "—"
                : stats.lastRun
                  ? new Date(stats.lastRun * 1000).toLocaleDateString()
                  : "No runs yet"}
          </div>
        </div>
      </div>

      {/* treasury balance */}
      <div className="balance-card">
        <div className="balance-top">
          <span className="badge-icon">
            <Coins size={18} />
          </span>
          <span className="balance-title">Treasury balance</span>
        </div>

        {reveal.kind === "empty" ? (
          <>
            <div className="balance-hidden">
              <Lock size={14} /> Treasury is empty
            </div>
            <div style={{ marginTop: 6, fontSize: 12.5, color: "var(--muted)" }}>
              Fund the treasury from Run Payroll to see an encrypted balance.
            </div>
          </>
        ) : reveal.kind === "revealed" ? (
          <>
            <div className="balance-value">{formatUnits(reveal.value, meta.decimals)}</div>
            <div className="reveal-unit" style={{ marginTop: 4 }}>{meta.tokenSymbol}</div>
          </>
        ) : reveal.kind === "working" ? (
          <>
            <div className="balance-hidden">
              <Spinner size={14} className="spin" /> {reveal.step}
            </div>
            <div style={{ marginTop: 6, fontSize: 12, color: "var(--muted)", fontFamily: "var(--mono)" }}>
              {reveal.secs > 0 ? `elapsed ${reveal.secs}s · waiting for gateway sync` : "confidential gateway"}
            </div>
          </>
        ) : reveal.kind === "denied" ? (
          <div className="note warn" style={{ marginTop: 12 }}>
            <Shield size={16} /> <span>Only the treasury owner can decrypt the balance.</span>
          </div>
        ) : reveal.kind === "error" ? (
          <div className="note err" style={{ marginTop: 12 }}>
            <Ban size={16} /> <span>{reveal.message}</span>
          </div>
        ) : (
          <>
            <div className="balance-hidden">
              <Lock size={14} /> Encrypted on-chain
              <span style={{ color: "var(--faint)" }}>· {balanceHandle ? shortAddr(balanceHandle) : ""}</span>
            </div>
            <div className="field">
              <button className="btn" onClick={revealTreasury} disabled={!isOwner}>
                <Eye size={16} /> {isOwner ? "Reveal balance" : "Owner only"}
              </button>
            </div>
          </>
        )}
      </div>

      {/* run payroll CTA */}
      <div className="cta-card">
        <span className="badge-icon">
          <Coins size={18} />
        </span>
        <div className="cta-text">
          <div className="cta-title">Run confidential payroll</div>
          <div className="cta-sub">Fund the treasury and pay your team hidden amounts in one transaction.</div>
        </div>
        <button className="btn btn-primary" onClick={() => onNavigate("run")} disabled={!isOwner}>
          Run payroll <ArrowRight size={15} />
        </button>
      </div>
    </div>
  );
}