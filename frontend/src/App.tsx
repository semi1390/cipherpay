import { useEffect, useState } from "react";
import { Contract, isAddress } from "ethers";
import {
  connectWallet,
  getConfiguredTreasury,
  shortAddr,
  fullError,
  EXPLORER,
  TREASURY_ABI,
  resolveTokenMeta,
  type Connection,
  type TokenMeta,
} from "./nox";
import { Lock, Shield, Grid, Coins, History as HistoryIcon, Receipt, ArrowUpRight, Spinner, Ban, Copy, LogOut, ChevronDown } from "./icons";
import Landing from "./Landing";
import Dashboard from "./Dashboard";
import EmployerView from "./EmployerView";
import History from "./History";
import MyPay from "./MyPay";

const LS_KEY = "cipherpay.treasuryAddress";
const PAGES = ["dashboard", "run", "history", "mypay"] as const;
type Page = (typeof PAGES)[number];

function parseHash(): Page {
  const h = window.location.hash.replace(/^#\/?/, "").toLowerCase();
  return (PAGES as readonly string[]).includes(h) ? (h as Page) : "dashboard";
}

const NAV: { page: Page; label: string; icon: typeof Grid }[] = [
  { page: "dashboard", label: "Dashboard", icon: Grid },
  { page: "run", label: "Run Payroll", icon: Coins },
  { page: "history", label: "History", icon: HistoryIcon },
  { page: "mypay", label: "My Pay", icon: Receipt },
];

export default function App() {
  const [conn, setConn] = useState<Connection | null>(null);
  const [connErr, setConnErr] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const [page, setPage] = useState<Page>(parseHash());
  useEffect(() => {
    const on = () => setPage(parseHash());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  const navigate = (p: Page) => {
    window.location.hash = `/${p}`;
    setPage(p);
  };

  const initial = getConfiguredTreasury() ?? localStorage.getItem(LS_KEY) ?? "";
  const [treasury, setTreasury] = useState<string>(isAddress(initial) ? initial : "");
  const [treasuryInput, setTreasuryInput] = useState<string>(initial);

  const [meta, setMeta] = useState<TokenMeta | null>(null);
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

  useEffect(() => {
    if (!conn || !treasury) return;
    let cancelled = false;
    setMeta(null);
    setTokenErr(null);
    (async () => {
      try {
        const tokenAddr = (await new Contract(treasury, TREASURY_ABI, conn.readProvider).token()) as string;
        const m = await resolveTokenMeta(conn.readProvider, tokenAddr);
        if (!cancelled) setMeta(m);
      } catch (e) {
        if (!cancelled) setTokenErr(fullError(e));
      }
    })();
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

  function disconnect() {
    setMenuOpen(false);
    setConn(null);
    setConnErr(null);
    // Returns the app to the landing screen. Browser wallets stay connected at the
    // extension level; this drops the app's session, which is what users expect.
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

  const ready = !!conn && !!treasury && !!meta;

  return (
    <div className="app">
      {/* ---- nav ---- */}
      {!conn ? (
        <header className="nav">
          <div className="nav-inner">
            <div className="brand">
              <span className="brand-mark">
                <Lock size={15} />
              </span>
              CipherPay
            </div>
            <span className="chip">
              <Shield size={13} /> Ethereum Sepolia
            </span>
          </div>
        </header>
      ) : (
        <header className="appnav">
          <div className="appnav-inner">
            <div className="brand">
              <span className="brand-mark">
                <Lock size={15} />
              </span>
              CipherPay
            </div>
            {ready && (
              <nav className="navlinks">
                {NAV.map((n) => (
                  <button
                    key={n.page}
                    className={`navlink ${page === n.page ? "on" : ""}`}
                    onClick={() => navigate(n.page)}
                  >
                    <n.icon size={15} /> {n.label}
                  </button>
                ))}
              </nav>
            )}
            <div className="spacer" />
            <div className="wallet-menu">
              <button className="wallet" onClick={() => setMenuOpen((o) => !o)}>
                <span className="dot" /> {shortAddr(conn.address)}
                <ChevronDown size={13} className={menuOpen ? "chev open" : "chev"} />
              </button>
              {menuOpen && (
                <>
                  <div className="wm-backdrop" onClick={() => setMenuOpen(false)} />
                  <div className="wallet-dropdown">
                    <div className="wm-head">
                      <span className="dot" /> Ethereum Sepolia
                      <span className="wm-addr">{shortAddr(conn.address)}</span>
                    </div>
                    <button
                      className="wm-item"
                      onClick={() => {
                        navigator.clipboard?.writeText(conn.address);
                        setMenuOpen(false);
                      }}
                    >
                      <Copy size={15} /> Copy address
                    </button>
                    <a
                      className="wm-item"
                      href={`${EXPLORER}/address/${conn.address}`}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => setMenuOpen(false)}
                    >
                      <ArrowUpRight size={15} /> View on Etherscan
                    </a>
                    <button
                      className="wm-item"
                      onClick={() => {
                        setTreasury("");
                        setMenuOpen(false);
                      }}
                    >
                      <Shield size={15} /> Change treasury
                    </button>
                    <div className="wm-sep" />
                    <button className="wm-item danger" onClick={disconnect}>
                      <LogOut size={15} /> Disconnect
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
          {ready && (
            <div className="navmobile">
              {NAV.map((n) => (
                <button
                  key={n.page}
                  className={`navlink ${page === n.page ? "on" : ""}`}
                  onClick={() => navigate(n.page)}
                >
                  <n.icon size={15} /> {n.label}
                </button>
              ))}
            </div>
          )}
        </header>
      )}

      <main className="main">
        <div className={conn ? "wrap-wide" : "wrap"}>
          {connErr && (
            <div className="note err">
              <Ban size={16} /> <span>{connErr}</span>
            </div>
          )}

          {!conn ? (
            <Landing onConnect={onConnect} connecting={connecting} />
          ) : !treasury ? (
            <section className="card" style={{ marginTop: 34 }}>
              <div className="card-head">
                <span className="badge-icon">
                  <Shield size={19} />
                </span>
                <div>
                  <h2 className="title">Connect your treasury</h2>
                  <p className="desc">
                    Enter your deployed CipherPayrollTreasury address on Ethereum Sepolia (the{" "}
                    <code>treasury</code> field from <code>deployment.payroll-treasury.json</code>), or
                    set <code>VITE_TREASURY_ADDRESS</code> in <code>.env</code>.
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
          ) : tokenErr ? (
            <div className="note err" style={{ marginTop: 34 }}>
              <Ban size={16} />
              <span>
                Couldn't read a wrapper-backed token from <code>{shortAddr(treasury)}</code>. This app
                needs a treasury deployed with <code>deployWrapperPayroll.ts</code> (its token is the
                USDC wrapper). {tokenErr}{" "}
                <button className="textbtn" onClick={() => setTreasury("")}>
                  change address
                </button>
              </span>
            </div>
          ) : !meta ? (
            <div className="note accent" style={{ marginTop: 34 }}>
              <Spinner size={16} className="spin" /> Loading treasury…
            </div>
          ) : (
            <>
              {/* treasury context line */}
              <div className="ctx" style={{ marginTop: 26, marginBottom: 0 }}>
                <span>Treasury</span>
                <span className="mono">{shortAddr(treasury)}</span>
                <a className="link" href={`${EXPLORER}/address/${treasury}`} target="_blank" rel="noreferrer">
                  Etherscan <ArrowUpRight size={13} />
                </a>
                <button className="textbtn" onClick={() => setTreasury("")}>
                  change
                </button>
              </div>

              {page === "dashboard" && (
                <Dashboard conn={conn} treasuryAddr={treasury} meta={meta} onNavigate={navigate} />
              )}
              {page === "run" && <EmployerView conn={conn} treasuryAddr={treasury} meta={meta} />}
              {page === "history" && <History conn={conn} treasuryAddr={treasury} />}
              {page === "mypay" && <MyPay conn={conn} treasuryAddr={treasury} meta={meta} />}
            </>
          )}
        </div>
      </main>

      <footer className="footer">
        <Lock size={12} /> Amounts encrypted client-side · confidential ERC-7984 on iExec Nox
      </footer>
    </div>
  );
}