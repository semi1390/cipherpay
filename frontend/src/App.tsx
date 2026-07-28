import { useEffect, useState } from "react";
import { isAddress } from "ethers";
import { connectWallet, getConfiguredAddress, shortAddr, fullError, EXPLORER, type Connection } from "./nox";
import { Lock, Shield, Wallet, Bolt, ArrowUpRight, Spinner, Ban, CheckCircle } from "./icons";
import EmployerView from "./EmployerView";
import EmployeeView from "./EmployeeView";

const LS_KEY = "cipherpay.contractAddress";

export default function App() {
  const [conn, setConn] = useState<Connection | null>(null);
  const [connErr, setConnErr] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [view, setView] = useState<"employer" | "employee">("employer");

  const initial = getConfiguredAddress() ?? localStorage.getItem(LS_KEY) ?? "";
  const [addr, setAddr] = useState<string>(isAddress(initial) ? initial : "");
  const [addrInput, setAddrInput] = useState<string>(initial);

  // Keep app state consistent when the wallet switches account or network.
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

  function useThisContract() {
    if (!isAddress(addrInput)) {
      setConnErr("Enter a valid contract address (0x… 40 hex chars).");
      return;
    }
    setConnErr(null);
    setAddr(addrInput);
    localStorage.setItem(LS_KEY, addrInput);
  }

  return (
    <div className="app">
      <header className="nav">
        <div className="nav-inner">
          <div className="brand">
            <span className="brand-mark">
              <Lock size={16} />
            </span>
            Cipher<em>Pay</em>
          </div>
          {conn ? (
            <span className="wallet">
              <span className="dot" /> Sepolia · {shortAddr(conn.address)}
            </span>
          ) : (
            <span className="chip">
              <Shield size={13} /> Ethereum Sepolia
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
            /* ---------------- LANDING / HERO ---------------- */
            <section className="hero">
              <span className="eyebrow">
                <Lock size={13} /> Confidential on-chain payroll
              </span>
              <h1 className="hero-title">
                Payroll on-chain.
                <br />
                Salaries, <span className="grad">private.</span>
              </h1>
              <p className="hero-sub">
                Confidential payroll for modern companies — verifiable payments, hidden amounts,
                powered by iExec Nox. Every salary is encrypted in the browser before it touches
                Ethereum, and only its owner can decrypt it.
              </p>

              <div className="hero-actions">
                <button className="btn btn-primary btn-lg" onClick={onConnect} disabled={connecting}>
                  {connecting ? (
                    <>
                      <Spinner className="spin" /> Connecting…
                    </>
                  ) : (
                    <>
                      <Wallet size={17} /> Connect wallet
                    </>
                  )}
                </button>
                <span className="chip">
                  <Bolt size={13} /> MetaMask · Sepolia only
                </span>
              </div>

              <div className="hero-trust">
                <span className="trust">
                  <Shield size={14} /> Powered by iExec Nox
                </span>
                <span className="trust">
                  <Lock size={14} /> End-to-end encrypted
                </span>
                <span className="trust">
                  <CheckCircle size={14} /> Verifiable on Etherscan
                </span>
              </div>

              {/* the core contrast: plaintext in → ciphertext on-chain */}
              <div className="proof">
                <div className="proof-row plain">
                  <span className="proof-label">Salary you enter</span>
                  <span className="proof-plain">$120,000</span>
                </div>
                <div className="proof-arrow">encrypted in your browser ↓</div>
                <div className="proof-row chain">
                  <span className="proof-label">
                    <Lock size={14} /> Stored on-chain
                  </span>
                  <span className="proof-cipher">0x0000aa36a72301669bdf…a989bc</span>
                </div>
              </div>
            </section>
          ) : !addr ? (
            /* ---------------- CONTRACT SELECT ---------------- */
            <section className="panel">
              <div className="panel-head">
                <span className="icon-badge brand">
                  <Shield size={20} />
                </span>
                <div>
                  <h2 className="title">Connect a payroll</h2>
                  <p className="desc">
                    Enter your deployed CipherPayroll address (from{" "}
                    <code>deployment.payroll.json</code>), or set <code>VITE_CONTRACT_ADDRESS</code>{" "}
                    in <code>frontend/.env</code>.
                  </p>
                </div>
              </div>
              <div className="field">
                <label className="label">Contract address</label>
                <input
                  className="input"
                  placeholder="0x… CipherPayroll address"
                  value={addrInput}
                  onChange={(e) => setAddrInput(e.target.value.trim())}
                  spellCheck={false}
                />
              </div>
              <div className="field">
                <button className="btn btn-primary" onClick={useThisContract}>
                  Continue <ArrowUpRight size={15} />
                </button>
              </div>
            </section>
          ) : (
            /* ---------------- APP (tabs + views) ---------------- */
            <section>
              <div className="tabs" role="tablist">
                <button
                  className={`tab ${view === "employer" ? "on" : ""}`}
                  onClick={() => setView("employer")}
                >
                  Employer
                </button>
                <button
                  className={`tab ${view === "employee" ? "on" : ""}`}
                  onClick={() => setView("employee")}
                >
                  Employee
                </button>
              </div>

              <div className="ctx">
                <span>Payroll</span>
                <span className="mono">{shortAddr(addr)}</span>
                <a className="link" href={`${EXPLORER}/address/${addr}`} target="_blank" rel="noreferrer">
                  Etherscan <ArrowUpRight size={13} />
                </a>
                <button className="textbtn" onClick={() => setAddr("")}>
                  change
                </button>
              </div>

              {view === "employer" ? (
                <EmployerView conn={conn} contractAddr={addr} />
              ) : (
                <EmployeeView conn={conn} contractAddr={addr} />
              )}
            </section>
          )}
        </div>
      </main>

      <footer className="footer">
        <Lock size={13} /> Amounts encrypted client-side · never stored in plaintext on-chain
      </footer>
    </div>
  );
}