import { useEffect, useState } from "react";
import { Contract, isAddress } from "ethers";
import {
  connectWallet,
  getConfiguredTreasury,
  shortAddr,
  fullError,
  EXPLORER,
  TREASURY_ABI,
  type Connection,
} from "./nox";
import { Lock, Shield, Wallet, Coins, Eye, ArrowUpRight, Spinner, Ban, CheckCircle } from "./icons";
import EmployerView from "./EmployerView";
import EmployeeView from "./EmployeeView";

const LS_KEY = "cipherpay.treasuryAddress";

export default function App() {
  const [conn, setConn] = useState<Connection | null>(null);
  const [connErr, setConnErr] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [view, setView] = useState<"employer" | "employee">("employer");

  const initial = getConfiguredTreasury() ?? localStorage.getItem(LS_KEY) ?? "";
  const [treasury, setTreasury] = useState<string>(isAddress(initial) ? initial : "");
  const [treasuryInput, setTreasuryInput] = useState<string>(initial);

  const [tokenAddr, setTokenAddr] = useState<string | null>(null);
  const [tokenErr, setTokenErr] = useState<string | null>(null);

  useEffect(() => {
    const eth = window.ethereum;
    if (!eth?.on) return;
    const reload = () => window.location.reload();
    eth.on("accountsChanged", reload);
    eth.on("chainChanged", reload);
    return () => {
      eth.removeListener?.("accountsChanged", reload);
      eth.removeListener?.("chainChanged", reload);
    };
  }, []);

  // Read the token address from the treasury once we have both.
  useEffect(() => {
    if (!conn || !treasury) return;
    let cancelled = false;
    setTokenAddr(null);
    setTokenErr(null);
    const c = new Contract(treasury, TREASURY_ABI, conn.readProvider);
    c.token()
      .then((t: string) => !cancelled && setTokenAddr(t))
      .catch((e: unknown) => !cancelled && setTokenErr(fullError(e)));
    return () => {
      cancelled = true;
    };
  }, [conn, treasury]);

  async function onConnect() {
    setConnErr(null);
    setConnecting(true);
    try {
      setConn(await connectWallet());
    } catch (e) {
      setConnErr(fullError(e));
    } finally {
      setConnecting(false);
    }
  }

  function useThisTreasury() {
    if (!isAddress(treasuryInput)) {
      setConnErr("Enter a valid treasury contract address (0x…).");
      return;
    }
    setConnErr(null);
    setTreasury(treasuryInput);
    localStorage.setItem(LS_KEY, treasuryInput);
  }

  return (
    <div className="app">
      <header className="nav">
        <div className="nav-inner">
          <div className="brand">
            <span className="brand-mark">
              <Lock size={15} />
            </span>
            CipherPay
          </div>
          {conn ? (
            <span className="wallet">
              <span className="dot" /> Arbitrum Sepolia · {shortAddr(conn.address)}
            </span>
          ) : (
            <span className="chip">
              <Shield size={13} /> Arbitrum Sepolia
            </span>
          )}
        </div>
      </header>

      <main className="main">
        <div className="wrap">
          {connErr && (
            <div className="note err">
              <Ban size={16} /> <span>{connErr}</span>
            </div>
          )}

          {!conn ? (
            <section className="hero">
              <span className="eyebrow">
                <Lock size={13} /> Confidential on-chain payroll
              </span>
              <h1 className="hero-title">
                Pay your team on-chain.
                <br />
                Amounts stay <span className="a">private.</span>
              </h1>
              <p className="hero-sub">
                CipherPay funds a confidential treasury and pays employees in a single on-chain run —
                verifiable on Arbiscan, with every amount encrypted. Only each employee can reveal
                their own pay.
              </p>
              <div className="hero-actions">
                <button className="btn btn-primary btn-lg" onClick={onConnect} disabled={connecting}>
                  {connecting ? (
                    <>
                      <Spinner size={17} className="spin" /> Connecting…
                    </>
                  ) : (
                    <>
                      <Wallet size={17} /> Connect wallet
                    </>
                  )}
                </button>
                <span className="chip">MetaMask · Arbitrum Sepolia</span>
              </div>
              <div className="hero-points">
                <div className="point">
                  <Coins size={17} /> Fund a confidential treasury with encrypted balances
                </div>
                <div className="point">
                  <CheckCircle size={17} /> Run payroll — hidden amounts, public proof on Arbiscan
                </div>
                <div className="point">
                  <Eye size={17} /> Each employee reveals only their own pay
                </div>
              </div>
            </section>
          ) : !treasury ? (
            <section className="card">
              <div className="card-head">
                <span className="badge-icon">
                  <Shield size={19} />
                </span>
                <div>
                  <h2 className="title">Connect your treasury</h2>
                  <p className="desc">
                    Enter your deployed CipherPayrollTreasury address on Arbitrum Sepolia (the{" "}
                    <code>treasury</code> field from <code>deployment.payroll-treasury.json</code>),
                    or set <code>VITE_TREASURY_ADDRESS</code> in <code>.env</code>.
                  </p>
                </div>
              </div>
              <div className="field">
                <label className="label">Treasury address</label>
                <input
                  className="input"
                  placeholder="0x… CipherPayrollTreasury"
                  value={treasuryInput}
                  onChange={(e) => setTreasuryInput(e.target.value.trim())}
                  spellCheck={false}
                />
              </div>
              <div className="field">
                <button className="btn btn-primary" onClick={useThisTreasury}>
                  Continue <ArrowUpRight size={15} />
                </button>
              </div>
            </section>
          ) : (
            <section>
              <div className="tabs">
                <button className={`tab ${view === "employer" ? "on" : ""}`} onClick={() => setView("employer")}>
                  Employer
                </button>
                <button className={`tab ${view === "employee" ? "on" : ""}`} onClick={() => setView("employee")}>
                  Employee
                </button>
              </div>

              <div className="ctx">
                <span>Treasury</span>
                <span className="mono">{shortAddr(treasury)}</span>
                <a className="link" href={`${EXPLORER}/address/${treasury}`} target="_blank" rel="noreferrer">
                  Arbiscan <ArrowUpRight size={13} />
                </a>
                <button className="textbtn" onClick={() => setTreasury("")}>
                  change
                </button>
              </div>

              {tokenErr ? (
                <div className="note err">
                  <Ban size={16} />
                  <span>
                    Couldn't read the token from this treasury. Is <code>{shortAddr(treasury)}</code> a
                    CipherPayrollTreasury on Arbitrum Sepolia? {tokenErr}
                  </span>
                </div>
              ) : !tokenAddr ? (
                <div className="note accent">
                  <Spinner size={16} className="spin" /> Loading treasury…
                </div>
              ) : view === "employer" ? (
                <EmployerView conn={conn} treasuryAddr={treasury} tokenAddr={tokenAddr} />
              ) : (
                <EmployeeView conn={conn} tokenAddr={tokenAddr} />
              )}
            </section>
          )}
        </div>
      </main>

      <footer className="footer">
        <Lock size={12} /> Amounts encrypted client-side · confidential ERC-7984 on iExec Nox
      </footer>
    </div>
  );
}
