// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// A minimal owner-mintable confidential token for the CipherPay payroll spike.
//
// It uses Nox's ERC-7984 reference implementation (@iexec-nox/nox-confidential-contracts),
// which is built on the SAME Nox library (euint256 handles) your CipherPay already uses —
// NOT Zama's fhEVM / @openzeppelin/confidential-contracts (that stack uses euint64 and
// @fhevm/solidity). Balances and transfer amounts are encrypted euint256 handles; the
// base contract auto-grants each holder ACL access to their own balance after every
// mint/transfer, so a recipient can decrypt their own balance off-chain.
//
// Compiler: 0.8.35 (ERC7984 is pragma ^0.8.28, the Nox library is ^0.8.35).
import {ERC7984} from "@iexec-nox/nox-confidential-contracts/contracts/token/ERC7984.sol";
import {Nox, euint256, externalEuint256} from "@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract CipherPayToken is ERC7984, Ownable {
    constructor(address initialOwner)
        ERC7984("CipherPay USD", "cpUSD", "")
        Ownable(initialOwner)
    {}

    /// @notice Owner mints a CONFIDENTIAL amount to `to`. The amount is encrypted
    ///         off-chain (encryptInput bound to this token) so even the minted amount
    ///         is hidden on-chain. The base grants `to` ACL access to its new balance.
    function mint(address to, externalEuint256 encryptedAmount, bytes calldata inputProof)
        external
        onlyOwner
        returns (euint256)
    {
        euint256 amount = Nox.fromExternal(encryptedAmount, inputProof);
        return _mint(to, amount);
    }
}
