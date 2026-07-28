// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

// A piggy bank is a simple savings container: you put money in
// and only the owner can take it out. This version keeps the
// balance encrypted so nobody can see how much is inside.
//
// This is the Nox "Hello World" contract, copied verbatim from
// https://docs.iex.ec/nox-protocol/getting-started/hello-world
//
// NOTE ON THE COMPILER VERSION:
//   The pragma below is ^0.8.27 (as in the docs), but the Nox
//   library it imports (Nox.sol) is pragma ^0.8.35. A compatible
//   compiler must therefore be >= 0.8.35, which is why
//   hardhat.config.ts pins solidity to "0.8.35". 0.8.35 satisfies
//   both this file's ^0.8.27 and the library's ^0.8.35.

import {Nox, euint256, externalEuint256} from "@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol";

contract ConfidentialPiggyBank {
    euint256 public balance;
    address public owner;

    constructor() {
        owner = msg.sender;
        // euint256 (unlike a plain uint256) must be explicitly
        // initialized to a valid encrypted handle.
        balance = Nox.toEuint256(0);
        // Grant permissions on the fresh handle (see below).
        Nox.allowThis(balance);
        Nox.allow(balance, owner);
    }

    function deposit(externalEuint256 inputHandle, bytes calldata inputProof) external {
        // Verify the Gateway proof and convert the external handle
        // into an euint256 this contract can compute on.
        euint256 amount = Nox.fromExternal(inputHandle, inputProof);
        balance = Nox.add(balance, amount);

        // #1 NOX bug for new developers:
        // Forgetting allowThis + allow after each operation makes the
        // new handle inaccessible on the next transaction. Transient
        // access is cleared at end-of-tx, so grant permissions here,
        // before the function returns.
        Nox.allowThis(balance);
        Nox.allow(balance, owner);
    }

    function withdraw(externalEuint256 inputHandle, bytes calldata inputProof) external {
        require(msg.sender == owner);
        euint256 amount = Nox.fromExternal(inputHandle, inputProof);
        balance = Nox.sub(balance, amount);

        Nox.allowThis(balance);
        Nox.allow(balance, owner);
    }
}
