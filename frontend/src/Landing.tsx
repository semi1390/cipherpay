import { Lock, Shield, Wallet, Coins, CheckCircle, Eye, Spinner, ArrowRight } from "./icons";

export default function Landing({ onConnect, connecting }: { onConnect: () => void; connecting: boolean }) {
  return (
    <section className="hero">
      <span className="eyebrow">
        <Lock size={13} /> Confidential on-chain payroll · Arbitrum
      </span>
      <h1 className="hero-title">
        Pay your team on-chain.
        <br />
        Amounts stay <span className="a">private.</span>
      </h1>
      <p className="hero-sub">
        Public blockchains make every salary visible to the world. CipherPay settles payroll on-chain
        — provable, auditable — while every amount is encrypted. Only each employee can reveal their
        own pay.
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

      {/* the privacy problem, before/after */}
      <div className="compare">
        <div className="compare-card bad">
          <div className="compare-label">
            <Eye size={13} /> Normal on-chain payroll
          </div>
          <div style={{ marginTop: 12 }}>
            <div className="pay-line">
              <span className="who">0xA1b2…9f3c</span>
              <span className="amt-open">$120,000</span>
            </div>
            <div className="pay-line">
              <span className="who">0xC3d4…7a21</span>
              <span className="amt-open">$250,000</span>
            </div>
            <div className="pay-line">
              <span className="who">0xE5f6…1b88</span>
              <span className="amt-open">$400,000</span>
            </div>
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: "#e88497" }}>Everyone sees every salary.</div>
        </div>

        <div className="compare-mid">
          <ArrowRight size={20} />
        </div>

        <div className="compare-card good">
          <div className="compare-label">
            <Lock size={13} /> CipherPay
          </div>
          <div style={{ marginTop: 12 }}>
            <div className="pay-line">
              <span className="who">0xA1b2…9f3c</span>
              <span className="amt-hidden">
                <Lock size={11} /> hidden
              </span>
            </div>
            <div className="pay-line">
              <span className="who">0xC3d4…7a21</span>
              <span className="amt-hidden">
                <Lock size={11} /> hidden
              </span>
            </div>
            <div className="pay-line">
              <span className="who">0xE5f6…1b88</span>
              <span className="amt-hidden">
                <Lock size={11} /> hidden
              </span>
            </div>
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: "var(--accent)" }}>
            Verifiable payments, encrypted amounts.
          </div>
        </div>
      </div>

      {/* a real public tx — with the amount hidden */}
      <div className="txmock">
        <div className="txmock-top">
          <Shield size={14} /> Arbitrum Sepolia · confidential transfer
          <span className="txmock-badge">
            <CheckCircle size={13} /> Success
          </span>
        </div>
        <div className="txmock-body">
          <div className="txmock-row">
            <span className="k">Method</span>
            <span className="v">runPayroll</span>
          </div>
          <div className="txmock-row">
            <span className="k">To</span>
            <span className="v">CipherPayrollTreasury</span>
          </div>
          <div className="txmock-row">
            <span className="k">Amount</span>
            <span className="v hidden">🔒 0x0000066eee2301dd49109797bc78…c465a7d (encrypted)</span>
          </div>
        </div>
      </div>

      {/* value props */}
      <div className="props">
        <div className="prop">
          <div className="prop-icon">
            <Coins size={17} />
          </div>
          <div className="prop-title">Fund a confidential treasury</div>
          <div className="prop-desc">Deposit encrypted balances the public chain can verify but not read.</div>
        </div>
        <div className="prop">
          <div className="prop-icon">
            <CheckCircle size={17} />
          </div>
          <div className="prop-title">Run payroll, amounts hidden</div>
          <div className="prop-desc">Pay your whole team in one transaction — publicly provable, privately valued.</div>
        </div>
        <div className="prop">
          <div className="prop-icon">
            <Eye size={17} />
          </div>
          <div className="prop-title">Employees reveal their own pay</div>
          <div className="prop-desc">Each person decrypts only their balance. No one else can — not even the employer.</div>
        </div>
      </div>
    </section>
  );
}