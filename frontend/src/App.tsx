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
    <div className="cp-app">
      <header className="cp-topbar">
        <div className="cp-topbar-inner">
          <div className="cp-brand">
            <span className="cp-brand-mark">
              <Lock size={16} />
            </span>
            Cipher<em>Pay</em>
          </div>
          {conn ? (
            <span className="cp-wallet">
              <span className="cp-dot" /> Sepolia · {shortAddr(conn.address)}
            </span>
          ) : (
            <span className="cp-chip">
              <Shield size={13} /> Ethereum Sepolia
            </span>
          )}
        </div>
      </header>

      <main className="cp-main">
        <div className="cp-container">
          {connErr && (
            <div className="cp-alert cp-alert--err">
              <Ban size={16} /> <span>{connErr}</span>
            </div>
          )}

          {!conn ? (
            /* ---------------- LANDING / HERO ---------------- */
            <section className="cp-hero">
              <span className="cp-eyebrow">
                <Lock size={13} /> Confidential on-chain payroll
              </span>
              <h1 className="cp-headline">
                Payroll, on-chain.
                <br />
                Salaries, <span className="cp-accent">private.</span>
              </h1>
              <p className="cp-subhead">
                CipherPay encrypts every salary in the browser before it ever touches Ethereum.
                Public verifiability, private amounts — settled on-chain, decrypted only by the
                person it belongs to.
              </p>

              <div className="cp-hero-cta">
                <button className="cp-btn cp-btn-primary cp-btn-lg" onClick={onConnect} disabled={connecting}>
                  {connecting ? (
                    <>
                      <Spinner className="cp-spin" /> Connecting…
                    </>
                  ) : (
                    <>
                      <Wallet size={17} /> Connect wallet
                    </>
                  )}
                </button>
                <span className="cp-chip">
                  <Bolt size={13} /> MetaMask · Sepolia only
                </span>
              </div>

              <div className="cp-trust">
                <span className="cp-trust-item">
                  <Shield size={14} /> Powered by iExec Nox
                </span>
                <span className="cp-trust-item">
                  <Lock size={14} /> End-to-end encrypted
                </span>
                <span className="cp-trust-item">
                  <CheckCircle size={14} /> Verifiable on Etherscan
                </span>
              </div>

              {/* the core contrast: plaintext in → ciphertext on-chain */}
              <div className="cp-proof">
                <div className="cp-proof-row plain">
                  <span className="cp-proof-label">Salary you enter</span>
                  <span className="cp-proof-plain">$120,000</span>
                </div>
                <div className="cp-proof-arrow">encrypted in your browser ↓</div>
                <div className="cp-proof-row chain">
                  <span className="cp-proof-label">
                    <Lock size={14} /> Stored on-chain
                  </span>
                  <span className="cp-mono" style={{ fontSize: 12.5, color: "var(--accent)" }}>
                    0x0000aa36a72301669bdf…a989bc
                  </span>
                </div>
              </div>
            </section>
          ) : !addr ? (
            /* ---------------- CONTRACT SELECT ---------------- */
            <section className="cp-card">
              <h2 className="cp-title">
                <Shield size={20} /> Connect a payroll
              </h2>
              <p className="cp-desc">
                Enter your deployed CipherPayroll address (from <code>deployment.payroll.json</code>),
                or set <code>VITE_CONTRACT_ADDRESS</code> in <code>frontend/.env</code>.
              </p>
              <div className="cp-field">
                <label className="cp-label">Contract address</label>
                <input
                  className="cp-input"
                  placeholder="0x… CipherPayroll address"
                  value={addrInput}
                  onChange={(e) => setAddrInput(e.target.value.trim())}
                  spellCheck={false}
                />
              </div>
              <div className="cp-field">
                <button className="cp-btn cp-btn-primary" onClick={useThisContract}>
                  Continue <ArrowUpRight size={15} />
                </button>
              </div>
            </section>
          ) : (
            /* ---------------- APP (tabs + views) ---------------- */
            <section>
              <div className="cp-segment" role="tablist">
                <button
                  className={`cp-segment-btn ${view === "employer" ? "is-active" : ""}`}
                  onClick={() => setView("employer")}
                >
                  Employer
                </button>
                <button
                  className={`cp-segment-btn ${view === "employee" ? "is-active" : ""}`}
                  onClick={() => setView("employee")}
                >
                  Employee
                </button>
              </div>

              <div className="cp-context">
                <span>Payroll</span>
                <span className="cp-mono">{shortAddr(addr)}</span>
                <a className="cp-link" href={`${EXPLORER}/address/${addr}`} target="_blank" rel="noreferrer">
                  Etherscan <ArrowUpRight size={13} />
                </a>
                <button className="cp-textbtn" onClick={() => setAddr("")}>
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

      <footer className="cp-footer">
        <Lock size={13} /> Amounts encrypted client-side · never stored in plaintext on-chain ·
        Ethereum Sepolia
      </footer>
    </div>
  );
}