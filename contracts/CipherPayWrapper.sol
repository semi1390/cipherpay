// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/interfaces/IERC20.sol";
import {ERC20ToERC7984Wrapper} from "@iexec-nox/nox-confidential-contracts/contracts/token/extensions/ERC20ToERC7984Wrapper.sol";

/// @dev Confidential wrapper around a real ERC-20 (e.g. USDC). Wrapping mints a
///      1:1 confidential balance; unwrapping burns it and (after finalize) releases
///      the underlying ERC-20. This is the "real money" funding path for payroll.
contract CipherPayWrapper is ERC20ToERC7984Wrapper {
    constructor(IERC20 underlying)
        ERC20ToERC7984Wrapper("CipherPay USD", "cpUSD", "", underlying)
    {}
}
