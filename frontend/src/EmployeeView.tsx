import { useState } from "react";
import { Contract } from "ethers";
import {
  makeHandleClient,
  decryptSalary,
  DecryptDeniedError,
  PAYROLL_ABI,
  fullError,
  type Connection,
  type Hex,
} from "./nox";
import { Lock, LockOpen, Eye, Ban, Shield, Spinner } from "./icons";

interface Props {
  conn: Connection;
  contractAddr: string;
}

type State =
  | { kind: "idle" }
  | { kind: "reading" }
  | { kind: "decrypting"; secs: number }
  | { kind: "revealed"; salary: bigint }
  | { kind: "nosalary" }
  | { kind: "denied" }
  | { kind: "error"; message: string };

export default function EmployeeView({ conn, contractAddr }: Props) {
  const [state, setState] = useState<State>({ kind: "idle" });

  async function onReveal() {
    setState({ kind: "reading" });
    try {
      // Read our own handle via the dedicated RPC, with from = us so
      // msg.sender in getMySalary() is the employee.
      const contract = new Contract(contractAddr, PAYROLL_ABI, conn.readProvider);
      let handle: Hex;
      try {
        handle = (await contract.getMySalary({ from: conn.address })) as Hex;
      } catch (e) {
        const msg = fullError(e);
        if (/no salary set/i.test(msg)) {
          setState({ kind: "nosalary" });
          return;
        }
        throw e;
      }

      setState({ kind: "decrypting", secs: 0 });
      const client = await makeHandleClient(conn.signer, conn.readProvider);
      const salary = await decryptSalary(client, handle, (secs) =>
        setState({ kind: "decrypting", secs })
      );
      setState({ kind: "revealed", salary });
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
    <div className="cp-card">
      <h2 className="cp-title">
        <Eye size={19} /> Reveal your salary
      </h2>
      <p className="cp-desc">
        Your salary is decrypted locally, in your browser, only after the Nox gateway confirms
        you're an authorized viewer. No one else — not even the employer — can decrypt it.
      </p>

      <div className="cp-field">
        <button className="cp-btn cp-btn-primary cp-btn-full cp-btn-lg" onClick={onReveal} disabled={busy}>
          {busy ? (
            <>
              <Spinner className="cp-spin" /> Working…
            </>
          ) : (
            <>
              <LockOpen size={17} /> Reveal my salary
            </>
          )}
        </button>
      </div>

      {state.kind === "reading" && (
        <div className="cp-working">
          <Spinner className="cp-spin" size={20} />
          <div className="cp-step">Reading your encrypted handle from the contract…</div>
        </div>
      )}

      {state.kind === "decrypting" && (
        <div className="cp-enclave">
          <div className="cp-enclave-head">
            <span className="cp-lock">
              <Lock size={19} />
            </span>
            <div>
              <div className="cp-enclave-title">Decrypting in secure enclave…</div>
              <div className="cp-enclave-sub">
                Verifying your on-chain access grant and re-encrypting the key to you. This can take
                up to a minute right after a salary is set.
              </div>
            </div>
          </div>
          <div className="cp-scanbox">
            <span className="cp-scan-cipher">
              0x0000aa36a72301669bdf843e30f104d73edf6358c77118366de8ccad40a989bc
            </span>
            <span className="cp-scanline" />
          </div>
          <div className="cp-timer">
            elapsed {state.secs}s · waiting for gateway sync
          </div>
        </div>
      )}

      {state.kind === "revealed" && (
        <div className="cp-reveal">
          <div className="cp-reveal-label">
            <LockOpen size={14} /> Your salary
          </div>
          <div className="cp-amount">{state.salary.toLocaleString()}</div>
          <div className="cp-reveal-note">Decrypted locally from the on-chain handle · visible only to you</div>
        </div>
      )}

      {state.kind === "nosalary" && (
        <div className="cp-empty">No salary is set for this address on this payroll.</div>
      )}

      {state.kind === "denied" && (
        <div className="cp-denied">
          <span className="cp-denied-icon">
            <Ban size={20} />
          </span>
          <div>
            <div className="cp-denied-title">Access denied — this salary isn't yours</div>
            <div className="cp-denied-body">
              Only the employee this salary belongs to can decrypt it. The on-chain ACL rejected the
              request before the gateway ever released the key.
            </div>
            <span className="cp-denied-tag">
              <Shield size={13} /> Privacy enforced by the protocol
            </span>
          </div>
        </div>
      )}

      {state.kind === "error" && (
        <div className="cp-alert cp-alert--err">
          <Ban size={16} /> <span>{state.message}</span>
        </div>
      )}
    </div>
  );
}