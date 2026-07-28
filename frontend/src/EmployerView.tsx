import { useEffect, useState } from "react";
import { Contract, isAddress } from "ethers";
import {
  makeHandleClient,
  PAYROLL_ABI,
  EXPLORER,
  shortAddr,
  fullError,
  type Connection,
  type Hex,
} from "./nox";
import { Lock, Shield, CheckCircle, ArrowUpRight, Spinner, Ban, Bolt } from "./icons";

interface Props {
  conn: Connection;
  contractAddr: string;
}

type Status =
  | { kind: "idle" }
  | { kind: "working"; step: string }
  | { kind: "done"; employee: string; txHash: string; handle: string }
  | { kind: "error"; message: string };

export default function EmployerView({ conn, contractAddr }: Props) {
  const [owner, setOwner] = useState<string | null>(null);
  const [ownerLoading, setOwnerLoading] = useState(true);
  const [employee, setEmployee] = useState("");
  const [salary, setSalary] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const isOwner = owner !== null && owner.toLowerCase() === conn.address.toLowerCase();

  useEffect(() => {
    let cancelled = false;
    setOwnerLoading(true);
    const contract = new Contract(contractAddr, PAYROLL_ABI, conn.readProvider);
    contract
      .owner()
      .then((o: string) => !cancelled && setOwner(o))
      .catch(() => !cancelled && setOwner(null))
      .finally(() => !cancelled && setOwnerLoading(false));
    return () => {
      cancelled = true;
    };
  }, [contractAddr, conn.readProvider]);

  async function onSubmit() {
    setStatus({ kind: "idle" });
    if (!isAddress(employee)) {
      setStatus({ kind: "error", message: "Enter a valid employee address (0x…)." });
      return;
    }
    let amount: bigint;
    try {
      amount = BigInt(salary.trim());
      if (amount < 0n) throw new Error();
    } catch {
      setStatus({ kind: "error", message: "Enter salary as a whole number (e.g. 100000)." });
      return;
    }

    try {
      setStatus({ kind: "working", step: "Encrypting salary in your browser…" });
      const client = await makeHandleClient(conn.signer, conn.readProvider);
      const { handle, handleProof } = await client.encryptInput(
        amount,
        "uint256",
        contractAddr as Hex
      );

      setStatus({ kind: "working", step: "Preparing transaction…" });
      const contract = new Contract(contractAddr, PAYROLL_ABI, conn.signer);

      // Price the tx (fees / gas / nonce) via the reliable read RPC. Doing this
      // avoids ethers calling getFeeData()/estimateGas() through the WALLET's RPC,
      // which can 404 on eth_blockNumber (the error you hit). The wallet then only
      // signs + broadcasts with these overrides — no reads on its flaky endpoint.
      const data = contract.interface.encodeFunctionData("setSalary", [
        employee,
        handle,
        handleProof,
      ]);
      const [feeData, nonce, gasEstimate] = await Promise.all([
        conn.readProvider.getFeeData(),
        conn.readProvider.getTransactionCount(conn.address),
        conn.readProvider.estimateGas({ from: conn.address, to: contractAddr, data }),
      ]);
      const overrides: Record<string, unknown> = {
        nonce,
        gasLimit: (gasEstimate * 12n) / 10n, // +20% buffer
      };
      if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
        overrides.maxFeePerGas = feeData.maxFeePerGas;
        overrides.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
      } else if (feeData.gasPrice) {
        overrides.gasPrice = feeData.gasPrice;
      }

      setStatus({ kind: "working", step: "Confirm the transaction in your wallet…" });
      const tx = await contract.setSalary(employee, handle, handleProof, overrides);

      setStatus({ kind: "working", step: `Waiting for confirmation… (${shortAddr(tx.hash)})` });
      // Wait via the reliable provider, not the wallet's (which was 404-ing).
      await conn.readProvider.waitForTransaction(tx.hash);

      setStatus({ kind: "done", employee, txHash: tx.hash, handle });
      setSalary("");
    } catch (e) {
      setStatus({ kind: "error", message: fullError(e) });
    }
  }

  const busy = status.kind === "working";

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="icon-badge cipher">
          <Lock size={20} />
        </span>
        <div>
          <h2 className="title">Set an encrypted salary</h2>
          <p className="desc">
            The amount is encrypted in your browser and stored on-chain as an opaque handle — the
            number never appears on Ethereum, and only the employee can decrypt it.
          </p>
        </div>
      </div>

      {ownerLoading ? (
        <div className="note cipher">
          <Spinner className="spin" /> Checking contract owner…
        </div>
      ) : owner === null ? (
        <div className="note err">
          <Ban size={16} />
          <span>
            Couldn't read <code>owner()</code> at {shortAddr(contractAddr)}. Is this a CipherPayroll
            contract on Sepolia?
          </span>
        </div>
      ) : !isOwner ? (
        <div className="note warn">
          <Shield size={16} />
          <span>
            This wallet ({shortAddr(conn.address)}) is <b>not the payroll owner</b>. Only the
            deployer can set salaries. Connect the owner wallet:{" "}
            <span className="mono">{owner}</span>.
          </span>
        </div>
      ) : (
        <div style={{ marginTop: 16 }}>
          <span className="pill ok">
            <CheckCircle size={15} /> You are the owner
          </span>
        </div>
      )}

      <div className="field">
        <label className="label">Employee wallet</label>
        <input
          className="input"
          placeholder="0x… employee address"
          value={employee}
          onChange={(e) => setEmployee(e.target.value.trim())}
          spellCheck={false}
          disabled={busy}
        />
      </div>

      <div className="field">
        <label className="label">
          <Lock size={13} /> Salary — encrypted before it leaves this device
        </label>
        <input
          className="input"
          placeholder="100000"
          value={salary}
          onChange={(e) => setSalary(e.target.value)}
          inputMode="numeric"
          disabled={busy}
        />
      </div>

      <div className="field">
        <button className="btn btn-primary btn-block" onClick={onSubmit} disabled={busy || !isOwner}>
          {busy ? (
            <>
              <Spinner className="spin" /> Working…
            </>
          ) : (
            <>
              <Lock size={16} /> Encrypt &amp; set salary
            </>
          )}
        </button>
      </div>

      {status.kind === "working" && (
        <div className="working">
          <Spinner className="spin" size={20} />
          <div>
            <div className="step">{status.step}</div>
            <div className="substep">Encrypted client-side — the amount never leaves in plaintext.</div>
          </div>
        </div>
      )}

      {status.kind === "error" && (
        <div className="note err">
          <Ban size={16} /> <span>{status.message}</span>
        </div>
      )}

      {status.kind === "done" && (
        <>
          <div className="note cipher">
            <CheckCircle size={16} />
            <span>
              Salary set for <span className="mono">{shortAddr(status.employee)}</span> and confirmed
              on Sepolia.
            </span>
          </div>

          {/* the core story: what's actually on-chain is ciphertext */}
          <div className="cipher-panel">
            <div className="cipher-head">
              <span className="cipher-lock">
                <Lock size={20} />
              </span>
              <div>
                <div className="cipher-title">🔒 Amount encrypted on-chain</div>
                <div className="cipher-subtitle">This is exactly what's stored — an opaque handle, not a number.</div>
              </div>
            </div>
            <div className="cipher-code">{status.handle}</div>
            <div className="cipher-note">
              Open the transaction's <b>Input Data</b> on Etherscan — the salary amount appears
              nowhere. Only the handle + proof are on-chain.
            </div>
            <div style={{ marginTop: 15 }}>
              <a
                className="btn btn-cipher"
                href={`${EXPLORER}/tx/${status.txHash}`}
                target="_blank"
                rel="noreferrer"
                style={{ display: "inline-flex" }}
              >
                <Bolt size={15} /> View transaction on Etherscan <ArrowUpRight size={15} />
              </a>
            </div>
          </div>
        </>
      )}
    </div>
  );
}