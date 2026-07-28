import { useState } from "react";
import { Contract } from "ethers";
import {
  makeHandleClient,
  decryptHandle,
  DecryptDeniedError,
  isZeroHandle,
  TOKEN_ABI,
  fullError,
  type Connection,
  type Hex,
} from "./nox";
import { Eye, Lock, Coins, Ban, Shield, Spinner } from "./icons";

interface Props {
  conn: Connection;
  tokenAddr: string;
}

type State =
  | { kind: "idle" }
  | { kind: "reading" }
  | { kind: "decrypting"; secs: number }
  | { kind: "revealed"; value: bigint }
  | { kind: "nopay" }
  | { kind: "denied" }
  | { kind: "error"; message: string };

export default function EmployeeView({ conn, tokenAddr }: Props) {
  const [state, setState] = useState<State>({ kind: "idle" });

  async function onReveal() {
    setState({ kind: "reading" });
    try {
      const token = new Contract(tokenAddr, TOKEN_ABI, conn.readProvider);
      const handle = (await token.confidentialBalanceOf(conn.address)) as Hex;

      // A zero handle means this wallet has never received confidential pay.
      if (isZeroHandle(handle)) {
        setState({ kind: "nopay" });
        return;
      }

      setState({ kind: "decrypting", secs: 0 });
      const client = await makeHandleClient(conn.signer, conn.readProvider);
      const value = await decryptHandle(client, handle, (secs) => setState({ kind: "decrypting", secs }));
      setState({ kind: "revealed", value });
    } catch (e) {
      if (e instanceof DecryptDeniedError) {
        setState({ kind: "denied" });
        return;
      }
      setState({ kind: "error", message: fullError(e) });
    }
  }

  const busy = state.kind === "reading" || state.kind === "decrypting";

  return (
    <div className="card">
      <div className="card-head">
        <span className="badge-icon">
          <Eye size={19} />
        </span>
        <div>
          <h2 className="title">Reveal your pay</h2>
          <p className="desc">
            Your pay is a confidential token balance, decrypted locally in your browser. Only you can
            reveal it — not the employer, not anyone reading the chain.
          </p>
        </div>
      </div>

      <div className="field">
        <button className="btn btn-primary btn-block btn-lg" onClick={onReveal} disabled={busy}>
          {busy ? (
            <>
              <Spinner size={17} className="spin" /> Working…
            </>
          ) : (
            <>
              <Eye size={17} /> Reveal my pay
            </>
          )}
        </button>
      </div>

      {state.kind === "reading" && (
        <div className="working">
          <Spinner size={18} className="spin" />
          <div className="step">Reading your confidential balance…</div>
        </div>
      )}

      {state.kind === "decrypting" && (
        <div className="decrypting">
          <div className="decrypting-head">
            <span className="lockpulse">
              <Lock size={18} />
            </span>
            <div>
              <div className="decrypting-title">Decrypting your pay…</div>
              <div className="decrypting-sub">
                Verifying your access with the confidential gateway. This can take up to a minute right
                after payday.
              </div>
            </div>
          </div>
          <div className="progress">
            <div className="progress-bar" />
          </div>
          <div className="timer">elapsed {state.secs}s</div>
        </div>
      )}

      {state.kind === "revealed" && (
        <div className="reveal">
          <div className="reveal-label">
            <Coins size={14} /> Your pay
          </div>
          <div className="reveal-amount">{state.value.toLocaleString()}</div>
          <div className="reveal-note">Confidential balance · decrypted locally · visible only to you</div>
        </div>
      )}

      {state.kind === "nopay" && (
        <div className="empty">No confidential pay found for this wallet on this token.</div>
      )}

      {state.kind === "denied" && (
        <div className="denied">
          <span className="denied-icon">
            <Ban size={19} />
          </span>
          <div>
            <div className="denied-title">Only this employee can view this pay</div>
            <div className="denied-body">
              This balance isn't yours to decrypt — the on-chain ACL rejected the request. That's the
              privacy guarantee working as intended.
            </div>
          </div>
        </div>
      )}

      {state.kind === "error" && (
        <div className="note err">
          <Ban size={16} /> <span>{state.message}</span>
        </div>
      )}
    </div>
  );
}
