// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

// Confidential on-chain payroll built on the Nox Library, using the same
// euint256 / externalEuint256 pattern as the ConfidentialPiggyBank that already
// round-trips on Sepolia.
//
// Compiler is pinned to 0.8.35 (see hardhat.config.ts): the Nox library is
// `pragma ^0.8.35`, so anything below 0.8.35 fails on the import.
import {Nox, euint256, externalEuint256} from "@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol";

/// @title  CipherPayroll
/// @notice A confidential payroll. Each employee's salary is stored as an
///         encrypted `euint256` handle — never plaintext on-chain. Per-employee
///         ACLs mean each employee can decrypt ONLY their own salary. Stored
///         handles are also per-employee salted so that identical salary amounts
///         do NOT collide to the same handle (see "anti-equality" below).
contract CipherPayroll {
    /// @notice The employer. Set to the deployer; only the owner can set salaries.
    address public owner;

    /// @dev employee address => salted encrypted salary handle.
    mapping(address => euint256) private salaries;

    /// @notice Whether an address currently has a salary set.
    mapping(address => bool) public isEmployee;

    /// @notice Enumerable roster.
    address[] public employees;

    event EmployeeAdded(address indexed employee);

    /// @notice Emitted on every set/update. `salaryHandle` is the (encrypted,
    ///         salted) handle pointer, not the value — safe to log.
    event SalarySet(address indexed employee, bytes32 salaryHandle);

    modifier onlyOwner() {
        require(msg.sender == owner, "CipherPayroll: not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    /// @notice Employer sets (or updates) an employee's encrypted salary.
    /// @dev The employer produces `encryptedSalary` + `inputProof` off-chain with
    ///      the JS SDK's encryptInput(value, "uint256", <this contract address>).
    /// @param employee        The employee whose salary is being set.
    /// @param encryptedSalary External handle from the JS SDK (bound to this contract).
    /// @param inputProof      The Gateway proof accompanying the handle.
    function setSalary(
        address employee,
        externalEuint256 encryptedSalary,
        bytes calldata inputProof
    ) external onlyOwner {
        require(employee != address(0), "CipherPayroll: zero employee");

        // Verify the proof and convert the external handle into an euint256.
        euint256 salary = Nox.fromExternal(encryptedSalary, inputProof);

        // --- Per-employee salt (anti-equality) -------------------------------
        // Derive a per-employee-DISTINCT salt from the (public) employee address,
        // then add it and subtract it back. The plaintext is unchanged — modular
        // add-then-sub of the same value is an exact inverse, even on overflow —
        // so the employee still decrypts their true salary. But the STORED handle
        // is now a function of the salt (see the note at the bottom), so two
        // employees with identical salaries get DIFFERENT stored handles.
        euint256 salt = Nox.toEuint256(uint256(uint160(employee)));
        euint256 stored = Nox.sub(Nox.add(salary, salt), salt);

        salaries[employee] = stored;

        // Selective disclosure — grant access after every new handle:
        //   - allowThis(stored):        THIS contract may reuse the handle later.
        //   - allow(stored, employee):  ONLY this employee may decrypt it off-chain.
        // The employer is intentionally NOT granted, giving per-employee isolation.
        Nox.allowThis(stored);
        Nox.allow(stored, employee);

        if (!isEmployee[employee]) {
            isEmployee[employee] = true;
            employees.push(employee);
            emit EmployeeAdded(employee);
        }
        emit SalarySet(employee, euint256.unwrap(stored));
    }

    /// @notice Employee reads THEIR OWN encrypted salary handle, to decrypt
    ///         off-chain with the Nox JS SDK's decrypt(handle).
    /// @dev Returns the `euint256` handle for `msg.sender` (bytes32 at the ABI
    ///      boundary). Reverts if the caller has no salary set.
    function getMySalary() external view returns (euint256) {
        require(isEmployee[msg.sender], "CipherPayroll: no salary set");
        return salaries[msg.sender];
    }

    /// @notice Number of employees on the payroll.
    function employeeCount() external view returns (uint256) {
        return employees.length;
    }
}

// ---------------------------------------------------------------------------
// Why the salt gives distinct handles (verified against the Nox library)
// ---------------------------------------------------------------------------
// A Nox computed handle is derived from the OPERATION GRAPH, not the value:
//   handle = keccak256(operator, operandHandles, noxCompute, uniqueSeed, outputIndex)
// (see NoxCompute `_generateHandle`). When any operand is confidential, the
// `uniqueSeed` is 0, so the handle is a deterministic function of the operand
// handles. Therefore:
//
//   stored = sub( add(salary, salt), salt )
//   stored_handle = f(Sub, [ f(Add, [salary_h, salt_h]), salt_h ])
//
// depends on BOTH salary_h and salt_h. Two employees with the same salary share
// salary_h, but their salt_h differ (salt is derived from the distinct employee
// address via wrapAsPublicHandle, which is deterministic in its value). Different
// salt_h => different add-handle => different stored handle. So equal salaries no
// longer collide in storage — an observer reading raw slots via eth_getStorageAt
// can no longer detect "these two employees earn the same" by comparing handles.
//
// Confidentiality is preserved: `add`/`sub` results carry the "unique" attribute
// bit, and `isPublicHandle` is true only when that bit is 0. So even though the
// salt is a PUBLIC handle, the salted result is confidential and ACL-gated — it
// is NOT publicly decryptable. The value stays hidden; only the ACL'd employee
// can decrypt it, and they get the real salary because the salt nets out.
//
// Scope / honest caveat: this defeats the CROSS-EMPLOYEE equality-from-storage
// comparison (the stated requirement). It does not by itself defeat a
// known-plaintext GUESSING attack ("is X's salary exactly V?") if Nox's off-chain
// input-handle derivation is both deterministic in the value AND reproducible by
// an arbitrary caller — the public, address-derived salt is observer-computable.
// Fully hiding against guessing would require a salt the observer cannot
// reproduce (a secret/oracle-provided value), which an on-chain contract can't
// guarantee. For this payroll spike, cross-employee equality hiding is the
// property we set out to add; flagging the stronger boundary for the team.
// ---------------------------------------------------------------------------
