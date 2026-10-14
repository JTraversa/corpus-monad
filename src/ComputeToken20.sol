// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {ERC1155Holder} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";

/// @title ComputeToken20
/// @notice ERC-20 view of one ComputeToken size, so the machine can trade on an order book (Kuru on Monad lists
/// ERC-20 pairs). `wrap` takes `qty` ERC-1155 tokens of `id` and mints `qty × 1e18` ERC-20 units; `unwrap` burns
/// them and returns the ERC-1155, which is what redeems for the machine. One whole ERC-20 unit is one
/// permanently funded machine. The wrapper holds nothing but the 1155 it issued against.
contract ComputeToken20 is ERC20, ERC1155Holder {
    IERC1155 public immutable token;
    uint256 public immutable id;
    uint256 public constant UNIT = 1e18;

    error ZeroQty();

    constructor(IERC1155 token_, uint256 id_, string memory name_, string memory symbol_) ERC20(name_, symbol_) {
        token = token_; id = id_;
    }

    function wrap(uint256 qty) external {
        if (qty == 0) revert ZeroQty();
        token.safeTransferFrom(msg.sender, address(this), id, qty, "");
        _mint(msg.sender, qty * UNIT);
    }

    /// @notice Burn `qty` whole units and receive `qty` ERC-1155 tokens back.
    function unwrap(uint256 qty) external {
        if (qty == 0) revert ZeroQty();
        _burn(msg.sender, qty * UNIT);
        token.safeTransferFrom(address(this), msg.sender, id, qty, "");
    }
}
