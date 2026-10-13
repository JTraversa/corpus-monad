// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {ERC1155Supply} from "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Supply.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title ComputeToken
/// @notice Redeemable compute on Monad. Each token id is one VM size on the corpus platform (Fly-modeled sizes:
/// shared-cpu-1x 1 GB and so on) for one fixed term, and one token is one VM-term. Minting is the payment: the
/// buyer pays the catalog price in USDC, the USDC goes to the corpus treasury (and from there into the Monad
/// lending vault; see treasury/), and the buyer holds a transferable claim. Redeeming burns the token and emits
/// `Redeemed` with a reference to the corpus account that should receive the machine; the corpus watcher
/// indexes that event and provisions the VM. Between mint and redeem the token is an ordinary ERC-1155 and
/// can be held, sent or sold.
///
/// `totalSupply(id)` is the outstanding liability for that size, in VM-terms. The operator sets prices from
/// the corpus catalog; a later version can price GPU sizes from FixingOracle instead.
contract ComputeToken is ERC1155, ERC1155Supply {
    using SafeERC20 for IERC20;

    struct VmType { string slug; string label; uint32 termDays; uint256 priceUsdc; bool active; }

    IERC20 public immutable usdc;   // 6 decimals
    address public operator;        // corpus platform
    address public treasury;        // receives mint payments
    VmType[] public types;          // id = index

    event TypeRegistered(uint256 indexed id, string slug, string label, uint32 termDays, uint256 priceUsdc);
    event PriceSet(uint256 indexed id, uint256 priceUsdc, bool active);
    event Minted(address indexed buyer, uint256 indexed id, uint256 qty, uint256 paidUsdc);
    event Redeemed(address indexed holder, uint256 indexed id, uint256 qty, bytes32 indexed accountRef);

    error NotOperator();
    error UnknownType();
    error Inactive();
    error ZeroQty();

    modifier onlyOperator() { if (msg.sender != operator) revert NotOperator(); _; }

    constructor(IERC20 usdc_, address treasury_, string memory uri_) ERC1155(uri_) {
        usdc = usdc_; operator = msg.sender; treasury = treasury_;
    }

    /// @notice Register a VM size. `priceUsdc` is the catalog price for one term, in 6-decimal USDC.
    function registerType(string calldata slug, string calldata label, uint32 termDays, uint256 priceUsdc) external onlyOperator returns (uint256 id) {
        types.push(VmType({ slug: slug, label: label, termDays: termDays, priceUsdc: priceUsdc, active: true }));
        id = types.length - 1;
        emit TypeRegistered(id, slug, label, termDays, priceUsdc);
    }

    function setPrice(uint256 id, uint256 priceUsdc, bool active) external onlyOperator {
        if (id >= types.length) revert UnknownType();
        types[id].priceUsdc = priceUsdc; types[id].active = active;
        emit PriceSet(id, priceUsdc, active);
    }

    /// @notice Buy `qty` VM-terms of size `id`. The caller must have approved `qty × price` USDC.
    function mint(uint256 id, uint256 qty) external returns (uint256 paid) {
        if (id >= types.length) revert UnknownType();
        if (!types[id].active) revert Inactive();
        if (qty == 0) revert ZeroQty();
        paid = types[id].priceUsdc * qty;
        usdc.safeTransferFrom(msg.sender, treasury, paid);
        _mint(msg.sender, id, qty, "");
        emit Minted(msg.sender, id, qty, paid);
    }

    /// @notice Burn `qty` tokens of size `id` and ask corpus to provision that many machines for `accountRef`
    /// (the keccak256 of the corpus account id, or any reference the platform agreed with the holder).
    function redeem(uint256 id, uint256 qty, bytes32 accountRef) external {
        if (id >= types.length) revert UnknownType();
        if (qty == 0) revert ZeroQty();
        _burn(msg.sender, id, qty);
        emit Redeemed(msg.sender, id, qty, accountRef);
    }

    function typeCount() external view returns (uint256) { return types.length; }
    function priceOf(uint256 id) external view returns (uint256) { if (id >= types.length) revert UnknownType(); return types[id].priceUsdc; }

    function setOperator(address next) external onlyOperator { operator = next; }
    function setTreasury(address next) external onlyOperator { treasury = next; }
    function setURI(string calldata uri_) external onlyOperator { _setURI(uri_); }

    function _update(address from, address to, uint256[] memory ids, uint256[] memory values) internal override(ERC1155, ERC1155Supply) {
        super._update(from, to, ids, values);
    }
}
