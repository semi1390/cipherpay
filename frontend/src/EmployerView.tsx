import { useEffect, useState } from "react";
import { Contract, isAddress, parseUnits, formatUnits } from "ethers";
import {
  makeHandleClient,
  sendTx,
  decryptHandle,
  DecryptDeniedError,
  TREASURY_ABI,
  WRAPPER_ABI,
  USDC_ABI,
  EXPLORER,
  shortAddr,
  fullError,
  type Connection,
  type TokenMeta,
  type Hex,
} from "./nox";
import { Coins, Users, Lock, CheckCircle, Shield, Ban, Spinner, ArrowUpRight, Plus, Trash, Eye } from "./icons";

interface Props {
  conn: Connection;
  treasuryAddr: string;
  meta: TokenMeta;
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

export default function EmployerView({ conn, treasuryAddr, meta }: Props) {
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

  const [owner, setOwner] = useState<string | null>(null);
  const [ownerLoading, setOwnerLoading] = useState(true);
  const isOwner = owner !== null && owner.toLowerCase() === conn.address.toLowerCase();

  const [usdcBalance, setUsdcBalance] = useState<bigint | null>(null);
  const [fundAmount, setFundAmount] = useState("");
  const [fund, setFund] = useState<Flow>({ kind: "idle" });
  const [faucet, setFaucet] = useState<Flow>({ kind: "idle" });

  const [rows, setRows] = useState<Row[]>([{ id: rowId++, address: "", amount: "" }]);
  const [payroll, setPayroll] = useState<Flow>({ kind: "idle" });
  const [reveal, setReveal] = useState<Reveal>({ kind: "idle" });

  async function refreshUsdc() {
    try {
      const bal = (await new Contract(meta.underlying, USDC_ABI, conn.readProvider).balanceOf(conn.address)) as bigint;
      setUsdcBalance(bal);
    } catch {
      setUsdcBalance(null);
    }
  }

  useEffect(() => {
    let cancelled = false;
    setOwnerLoading(true);
    new Contract(treasuryAddr, TREASURY_ABI, conn.readProvider)
      .owner()
      .then((o: string) => !cancelled && setOwner(o))
      .catch(() => !cancelled && setOwner(null))
      .finally(() => !cancelled && setOwnerLoading(false));
    refreshUsdc();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [treasuryAddr, conn.readProvider, conn.address]);

  async function onFaucet() {
    try {
      setFaucet({ kind: "working", step: "Minting test USDC…" });
      const amt = parseUnits("1000", dec);
      const txHash = await sendTx(conn, meta.underlying, USDC_ABI, "mint", [conn.address, amt]);
      await refreshUsdc();
      setFaucet({ kind: "done", txHash });
    } catch (e) {
      setFaucet({ kind: "error", message: fullError(e) });
    }
  }

  async function onFund() {
    const amount = parseAmt(fundAmount);
    if (amount === null) {
      setFund({ kind: "error", message: `Enter a positive ${meta.underlyingSymbol} amount to wrap.` });
      return;
    }
    try {
      const usdc = new Contract(meta.underlying, USDC_ABI, conn.readProvider);
      const allowance = (await usdc.allowance(conn.address, meta.wrapper)) as bigint;
      if (allowance < amount) {
        setFund({ kind: "working", step: `Approving the wrapper to use your ${meta.underlyingSymbol}…` });
        await sendTx(conn, meta.underlying, USDC_ABI, "approve", [meta.wrapper, amount]);
      }
      setFund({ kind: "working", step: `Wrapping ${fmt(amount)} ${meta.underlyingSymbol} into the treasury…` });
      const txHash = await sendTx(conn, meta.wrapper, WRAPPER_ABI, "wrap", [treasuryAddr, amount]);
      await refreshUsdc();
      setFund({ kind: "done", txHash });
    } catch (e) {
      setFund({ kind: "error", message: fullError(e) });
    }
  }

  async function onRunPayroll() {
    const clean = rows.map((r) => ({ address: r.address.trim(), amount: r.amount.trim() }));
    for (const r of clean) {
      if (!isAddress(r.address)) {
        setPayroll({ kind: "error", message: `Invalid employee address: ${r.address || "(empty)"}` });
        return;
      }
      if (parseAmt(r.amount) === null) {
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
        const { handle, handleProof } = await client.encryptInput(parseAmt(r.amount)!, "uint256", treasuryAddr as Hex);
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

  async function onRevealTreasury() {
    try {
      setReveal({ kind: "decrypting", secs: 0 });
      const treasury = new Contract(treasuryAddr, TREASURY_ABI, conn.readProvider);
      const handle = (await treasury.treasuryBalance()) as Hex;
      const client = await makeHandleClient(conn.signer, conn.readProvider);
      const value = await decryptHandle(client, handle, (secs) => setReveal({ kind: "decrypting", secs }));
      setReveal({ kind: "revealed", value });
    } catch (e) {
      if (e instanceof DecryptDeniedError) return setReveal({ kind: "denied" });
      setReveal({ kind: "error", message: fullError(e) });
    }
  }

  const funding = fund.kind === "working";
  const running = payroll.kind === "working";
  const fauceting = faucet.kind === "working";

  return (
    <div className="card">
      <div className="card-head">
        <span className="badge-icon">
          <Coins size={19} />
        </span>
        <div>
          <h2 className="title">Run confidential payroll</h2>
          <p className="desc">
            Wrap real {meta.underlyingSymbol} into the treasury, then pay your team hidden amounts of{" "}
            {meta.tokenSymbol} (confidential {meta.underlyingSymbol}, 1:1). Employees can unwrap back to{" "}
            {meta.underlyingSymbol} from My Pay.
          </p>
        </div>
      </div>

      {ownerLoading ? (
        <div className="note accent">
          <Spinner size={16} className="spin" /> Checking treasury…
        </div>
      ) : isOwner ? (
        <div style={{ marginTop: 15 }}>
          <span className="pill ok">
            <CheckCircle size={15} /> You are the treasury owner
          </span>
        </div>
      ) : (
        <div className="note accent" style={{ marginTop: 15 }}>
          <Shield size={16} />
          <span>
            <b>Demo mode — be your own employer.</b> Get test USDC, wrap it into the treasury, and run a
            payroll to addresses you control. Then switch to a paid wallet and reveal/withdraw in My Pay.
          </span>
        </div>
      )}

      <div className="section-label">1 · Fund treasury with {meta.underlyingSymbol}</div>
      <div className="note" style={{ marginTop: 8 }}>
        <Coins size={16} />
        <span>
          Your balance: <b>{usdcBalance !== null ? `${fmt(usdcBalance)} ${meta.underlyingSymbol}` : "…"}</b>
          {(
            <>
              {" · "}
              <button className="textbtn" onClick={onFaucet} disabled={fauceting}>
                {fauceting ? "getting…" : `get 1,000 test ${meta.underlyingSymbol}`}
              </button>
            </>
          )}
        </span>
      </div>
      {faucet.kind === "error" && (
        <div className="note err">
          <Ban size={16} /> <span>{faucet.message}</span>
        </div>
      )}

      <div className="field">
        <label className="label">
          <Lock size={13} /> Amount to wrap into the treasury ({meta.underlyingSymbol})
        </label>
        <input
          className="input"
          placeholder="1000"
          value={fundAmount}
          onChange={(e) => setFundAmount(e.target.value)}
          inputMode="decimal"
          disabled={funding}
        />
      </div>
      <div className="field">
        <button className="btn" onClick={onFund} disabled={funding}>
          {funding ? (
            <>
              <Spinner size={16} className="spin" /> Wrapping…
            </>
          ) : (
            <>
              <Coins size={16} /> Wrap into treasury
            </>
          )}
        </button>
      </div>
      {fund.kind === "working" && (
        <div className="working">
          <Spinner size={18} className="spin" />
          <div>
            <div className="step">{fund.step}</div>
            <div className="sub">The deposit is public; balances inside the treasury are hidden.</div>
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
            Wrapped into the treasury.{" "}
            <a className="link" href={`${EXPLORER}/tx/${fund.txHash}`} target="_blank" rel="noreferrer">
              View on Etherscan <ArrowUpRight size={13} />
            </a>
          </span>
        </div>
      )}

      <div className="section-label">2 · Employees &amp; amounts ({meta.tokenSymbol})</div>
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
            onChange={(e) => setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, amount: e.target.value } : x)))}
            inputMode="decimal"
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
        <button className="btn btn-primary btn-block" onClick={onRunPayroll} disabled={running}>
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
              <a className="v link" href={`${EXPLORER}/tx/${payroll.txHash}`} target="_blank" rel="noreferrer">
                Etherscan <ArrowUpRight size={13} />
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
                    Verifying your access with the confidential gateway (up to a minute after a run).
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
              <div className="reveal-amount">{fmt(reveal.value)}</div>
              <div className="reveal-unit">{meta.tokenSymbol}</div>
            </div>
          )}
          {reveal.kind === "denied" && (
            <div className="note warn">
              <Shield size={16} /> <span>Only the treasury owner can decrypt the balance.</span>
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