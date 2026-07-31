// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// Real confidential payroll on top of CipherPayToken (Nox ERC-7984, euint256).
//
// FUNDING MODEL (mint-to-treasury): the employer mints CipherPayToken directly to
// THIS contract, so the treasury holds a confidential token balance. (The package's
// ERC20ToERC7984Wrapper is the path for wrapping a real ERC-20; mint-to-treasury
// keeps the spike minimal.)
//
// PAYOUT FLOW (no operator approval): the treasury pays each employee FROM ITS OWN
// balance (it is the token holder / msg.sender), so no setOperator is needed. The
// employer encrypts each pay amount bound to THIS contract, owned by the employer.
// runPayroll: fromExternal (gives this contract access to the amount) -> allowTransient
// to the token (so the token can compute the transfer) -> confidentialTransfer moves a
// HIDDEN amount treasury -> employee. ERC7984 auto-grants each employee ACL access to
// its new balance, so employees decrypt ONLY their own pay.
//
// TREASURY VISIBILITY: an ERC-7984 balance is decryptable only by its HOLDER — here
// the treasury CONTRACT, which can't run the off-chain SDK. So the treasury explicitly
// grants the OWNER view access to its own balance (grantTreasuryView / auto after each
// payroll) for off-chain audit/reconciliation. This does NOT touch employee balances —
// each remains decryptable only by that employee.
//
// Compiler: 0.8.35 (this + ERC7984 are ^0.8.28; the Nox library is ^0.8.35).
import {IERC7984} from "@iexec-nox/nox-confidential-contracts/contracts/interfaces/IERC7984.sol";
import {Nox, euint256, externalEuint256} from "@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract CipherPayrollTreasury is Ownable {
    IERC7984 public immutable token;
    uint256 public batchCount;

    event PayrollRun(uint256 indexed batchId, uint256 count);
    event EmployeePaid(uint256 indexed batchId, address indexed employee);

    constructor(address token_, address initialOwner) Ownable(initialOwner) {
        token = IERC7984(token_);
    }

    /// @notice The treasury's own (encrypted) balance handle.
    function treasuryBalance() external view returns (euint256) {
        return token.confidentialBalanceOf(address(this));
    }

    /// @notice Grant the CALLER ACL access to decrypt the treasury's CURRENT balance,
    ///         for off-chain audit. Call this after funding to view the balance; it's
    ///         also invoked automatically at the end of each runPayroll.
    function grantTreasuryView() external {
        _grantTreasuryView();
    }

    /// @dev The treasury is an ACL viewer of its own balance, so it can grant the caller.
    function _grantTreasuryView() internal {
        Nox.allow(token.confidentialBalanceOf(address(this)), msg.sender);
    }

    /// @notice Pay a batch of employees hidden amounts from the treasury, in one tx.
    /// @param employees        recipient addresses
    /// @param encryptedAmounts per-employee amounts, each encrypted off-chain with
    ///        encryptInput(amount, "uint256", <THIS treasury address>)
    /// @param inputProofs      the matching Gateway proofs
    function runPayroll(
        address[] calldata employees,
        externalEuint256[] calldata encryptedAmounts,
        bytes[] calldata inputProofs
    ) external {
        require(
            employees.length == encryptedAmounts.length && employees.length == inputProofs.length,
            "CipherPayroll: length mismatch"
        );
        uint256 id = ++batchCount;
        for (uint256 i = 0; i < employees.length; i++) {
            euint256 amount = Nox.fromExternal(encryptedAmounts[i], inputProofs[i]);
            Nox.allowTransient(amount, address(token)); // let the token use this amount
            token.confidentialTransfer(employees[i], amount); // treasury -> employee, hidden
            emit EmployeePaid(id, employees[i]);
        }
        // Let the caller decrypt the treasury's post-payroll balance off-chain (audit).
        _grantTreasuryView();
        emit PayrollRun(id, employees.length);
    }
}
