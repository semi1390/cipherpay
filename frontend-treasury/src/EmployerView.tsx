import { useEffect, useState } from "react";
import { Contract, isAddress } from "ethers";
import {
  makeHandleClient,
  sendTx,
  decryptHandle,
  DecryptDeniedError,
  TREASURY_ABI,
  TOKEN_ABI,
  EXPLORER,
  shortAddr,
  fullError,
  type Connection,
  type Hex,
} from "./nox";
import { Coins, Users, Lock, CheckCircle, Shield, Ban, Spinner, ArrowUpRight, Plus, Trash, Eye } from "./icons";

interface Props {
  conn: Connection;
  treasuryAddr: string;
  tokenAddr: string;
}

type Flow =
  | { kind: "idle" }
  | { kind: "working"; step: string }
  | { kind: "done"; txHash: string }
  | { kind: "error"; message: string };

type Reveal =
  | { kind: "idle" }
  | { kind: "decrypting"; secs: number }
  | { kind: "revealed"; value: bigint }
  | { kind: "denied" }
  | { kind: "error"; message: string };

interface Row {
  id: number;
  address: string;
  amount: string;
}

let rowId = 1;

export default function EmployerView({ conn, treasuryAddr, tokenAddr }: Props) {
  const [owner, setOwner] = useState<string | null>(null);
  const [ownerLoading, setOwnerLoading] = useState(true);
  const isOwner = owner !== null && owner.toLowerCase() === conn.address.toLowerCase();

  const [fundAmount, setFundAmount] = useState("");
  const [fund, setFund] = useState<Flow>({ kind: "idle" });

  const [rows, setRows] = useState<Row[]>([{ id: rowId++, address: "", amount: "" }]);
  const [payroll, setPayroll] = useState<Flow>({ kind: "idle" });
  const [reveal, setReveal] = useState<Reveal>({ kind: "idle" });

  useEffect(() => {
    let cancelled = false;
    setOwnerLoading(true);
    const c = new Contract(treasuryAddr, TREASURY_ABI, conn.readProvider);
    c.owner()
      .then((o: string) => !cancelled && setOwner(o))
      .catch(() => !cancelled && setOwner(null))
      .finally(() => !cancelled && setOwnerLoading(false));
    return () => {
      cancelled = true;
    };
  }, [treasuryAddr, conn.readProvider]);

  function parseAmount(s: string): bigint | null {
    try {
      const v = BigInt(s.trim());
      return v > 0n ? v : null;
    } catch {
      return null;
    }
  }

  // ---- Fund treasury: mint encrypted balance to the treasury -------------
  async function onFund() {
    const amount = parseAmount(fundAmount);
    if (amount === null) {
      setFund({ kind: "error", message: "Enter a positive whole number to fund." });
      return;
    }
    try {
      setFund({ kind: "working", step: "Encrypting amount in your browser…" });
      const client = await makeHandleClient(conn.signer, conn.readProvider);
      // Fund amount is bound to the TOKEN (token.mint validates against itself).
      const { handle, handleProof } = await client.encryptInput(amount, "uint256", tokenAddr as Hex);

      setFund({ kind: "working", step: "Confirm the funding transaction in your wallet…" });
      const txHash = await sendTx(conn, tokenAddr, TOKEN_ABI, "mint", [treasuryAddr, handle, handleProof]);

      setFund({ kind: "done", txHash });
    } catch (e) {
      setFund({ kind: "error", message: fullError(e) });
    }
  }

  // ---- Run payroll: batch confidential transfer to employees ------------
  async function onRunPayroll() {
    const clean = rows.map((r) => ({ address: r.address.trim(), amount: r.amount.trim() }));
    for (const r of clean) {
      if (!isAddress(r.address)) {
        setPayroll({ kind: "error", message: `Invalid employee address: ${r.address || "(empty)"}` });
        return;
      }
      if (parseAmount(r.amount) === null) {
        setPayroll({ kind: "error", message: `Invalid amount for ${shortAddr(r.address)}.` });
        return;
      }
    }
    try {
      setReveal({ kind: "idle" });
      setPayroll({ kind: "working", step: "Encrypting each amount (bound to the treasury)…" });
      const client = await makeHandleClient(conn.signer, conn.readProvider);

      const addrs: string[] = [];
      const handles: string[] = [];
      const proofs: string[] = [];
      for (const r of clean) {
        // Pay amounts are bound to the TREASURY (runPayroll validates against itself).
        const { handle, handleProof } = await client.encryptInput(
          parseAmount(r.amount)!,
          "uint256",
          treasuryAddr as Hex
        );
        addrs.push(r.address);
        handles.push(handle);
        proofs.push(handleProof);
      }

      setPayroll({ kind: "working", step: "Confirm the payroll transaction in your wallet…" });
      const txHash = await sendTx(conn, treasuryAddr, TREASURY_ABI, "runPayroll", [addrs, handles, proofs]);

      setPayroll({ kind: "done", txHash });
    } catch (e) {
      setPayroll({ kind: "error", message: fullError(e) });
    }
  }

  // ---- Reveal treasury remaining (owner granted by runPayroll) ----------
  async function onRevealTreasury() {
    try {
      setReveal({ kind: "decrypting", secs: 0 });
      const treasury = new Contract(treasuryAddr, TREASURY_ABI, conn.readProvider);
      const handle = (await treasury.treasuryBalance()) as Hex;
      const client = await makeHandleClient(conn.signer, conn.readProvider);
      const value = await decryptHandle(client, handle, (secs) => setReveal({ kind: "decrypting", secs }));
      setReveal({ kind: "revealed", value });
    } catch (e) {
      if (e instanceof DecryptDeniedError) {
        setReveal({ kind: "denied" });
        return;
      }
      setReveal({ kind: "error", message: fullError(e) });
    }
  }

  const funding = fund.kind === "working";
  const running = payroll.kind === "working";

  return (
    <div className="card">
      <div className="card-head">
        <span className="badge-icon">
          <Coins size={19} />
        </span>
        <div>
          <h2 className="title">Run confidential payroll</h2>
          <p className="desc">
            Fund the treasury with an encrypted balance, then pay your team hidden amounts in one
            on-chain run. Amounts are encrypted in your browser and never appear on-chain.
          </p>
        </div>
      </div>

      {ownerLoading ? (
        <div className="note accent">
          <Spinner size={16} className="spin" /> Checking treasury owner…
        </div>
      ) : owner === null ? (
        <div className="note err">
          <Ban size={16} /> <span>Couldn't read the treasury owner. Check the address.</span>
        </div>
      ) : !isOwner ? (
        <div className="note warn">
          <Shield size={16} />
          <span>
            This wallet ({shortAddr(conn.address)}) is <b>not the treasury owner</b>. Only the owner
            can fund or run payroll. Connect: <span className="mono">{owner}</span>.
          </span>
        </div>
      ) : (
        <div style={{ marginTop: 15 }}>
          <span className="pill ok">
            <CheckCircle size={15} /> You are the treasury owner
          </span>
        </div>
      )}

      {/* 1. Fund */}
      <div className="section-label">1 · Fund treasury</div>
      <div className="field">
        <label className="label">
          <Lock size={13} /> Amount to mint into the treasury (encrypted)
        </label>
        <input
          className="input"
          placeholder="1000000"
          value={fundAmount}
          onChange={(e) => setFundAmount(e.target.value)}
          inputMode="numeric"
          disabled={funding || !isOwner}
        />
      </div>
      <div className="field">
        <button className="btn" onClick={onFund} disabled={funding || !isOwner}>
          {funding ? (
            <>
              <Spinner size={16} className="spin" /> Funding…
            </>
          ) : (
            <>
              <Coins size={16} /> Fund treasury
            </>
          )}
        </button>
      </div>
      {fund.kind === "working" && (
        <div className="working">
          <Spinner size={18} className="spin" />
          <div>
            <div className="step">{fund.step}</div>
            <div className="sub">Encrypted client-side — the amount never leaves in plaintext.</div>
          </div>
        </div>
      )}
      {fund.kind === "error" && (
        <div className="note err">
          <Ban size={16} /> <span>{fund.message}</span>
        </div>
      )}
      {fund.kind === "done" && (
        <div className="note accent">
          <CheckCircle size={16} />
          <span>
            Treasury funded (encrypted).{" "}
            <a className="link" href={`${EXPLORER}/tx/${fund.txHash}`} target="_blank" rel="noreferrer">
              View on Arbiscan <ArrowUpRight size={13} />
            </a>
          </span>
        </div>
      )}

      {/* 2. Payroll */}
      <div className="section-label">2 · Employees &amp; amounts</div>
      {rows.map((r) => (
        <div className="emp-row" key={r.id}>
          <input
            className="input addr"
            placeholder="0x… employee address"
            value={r.address}
            onChange={(e) =>
              setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, address: e.target.value.trim() } : x)))
            }
            spellCheck={false}
            disabled={running}
          />
          <input
            className="input amt"
            placeholder="amount"
            value={r.amount}
            onChange={(e) =>
              setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, amount: e.target.value } : x)))
            }
            inputMode="numeric"
            disabled={running}
          />
          <button
            className="icon-btn"
            title="Remove"
            onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.id !== r.id) : rs))}
            disabled={running || rows.length === 1}
          >
            <Trash size={16} />
          </button>
        </div>
      ))}
      <button
        className="add-row"
        onClick={() => setRows((rs) => [...rs, { id: rowId++, address: "", amount: "" }])}
        disabled={running}
      >
        <Plus size={15} /> Add employee
      </button>

      <div className="field">
        <button className="btn btn-primary btn-block" onClick={onRunPayroll} disabled={running || !isOwner}>
          {running ? (
            <>
              <Spinner size={16} className="spin" /> Running payroll…
            </>
          ) : (
            <>
              <Users size={16} /> Run payroll — {rows.length} {rows.length === 1 ? "employee" : "employees"}
            </>
          )}
        </button>
      </div>

      {payroll.kind === "working" && (
        <div className="working">
          <Spinner size={18} className="spin" />
          <div>
            <div className="step">{payroll.step}</div>
            <div className="sub">One transaction, all amounts hidden.</div>
          </div>
        </div>
      )}
      {payroll.kind === "error" && (
        <div className="note err">
          <Ban size={16} /> <span>{payroll.message}</span>
        </div>
      )}

      {payroll.kind === "done" && (
        <>
          <div className="privacy">
            <div className="privacy-row">
              <CheckCircle size={16} />
              <span className="k">Payroll settled on-chain</span>
              <a
                className="v link"
                href={`${EXPLORER}/tx/${payroll.txHash}`}
                target="_blank"
                rel="noreferrer"
              >
                Arbiscan <ArrowUpRight size={13} />
              </a>
            </div>
            <div className="privacy-row">
              <Lock size={16} />
              <span className="k">Amounts</span>
              <span className="v">🔒 hidden — not in the transaction</span>
            </div>
            <div className="privacy-row">
              <Eye size={16} />
              <span className="k">Visibility</span>
              <span className="v">only each employee can reveal their pay</span>
            </div>
          </div>

          {/* Treasury remaining */}
          {reveal.kind === "idle" && (
            <div className="field">
              <button className="btn" onClick={onRevealTreasury}>
                <Eye size={16} /> Reveal treasury remaining
              </button>
            </div>
          )}
          {reveal.kind === "decrypting" && (
            <div className="decrypting">
              <div className="decrypting-head">
                <span className="lockpulse">
                  <Lock size={18} />
                </span>
                <div>
                  <div className="decrypting-title">Decrypting treasury balance…</div>
                  <div className="decrypting-sub">
                    Verifying your access with the confidential gateway. This can take up to a minute
                    right after a payroll run.
                  </div>
                </div>
              </div>
              <div className="progress">
                <div className="progress-bar" />
              </div>
              <div className="timer">elapsed {reveal.secs}s</div>
            </div>
          )}
          {reveal.kind === "revealed" && (
            <div className="reveal">
              <div className="reveal-label">
                <Coins size={14} /> Treasury remaining
              </div>
              <div className="reveal-amount">{reveal.value.toLocaleString()}</div>
              <div className="reveal-note">Encrypted on-chain · decrypted locally for the owner</div>
            </div>
          )}
          {reveal.kind === "denied" && (
            <div className="note warn">
              <Shield size={16} /> <span>Not authorized to decrypt the treasury balance with this wallet.</span>
            </div>
          )}
          {reveal.kind === "error" && (
            <div className="note err">
              <Ban size={16} /> <span>{reveal.message}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
