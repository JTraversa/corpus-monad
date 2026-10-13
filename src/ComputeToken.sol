// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {ERC1155Supply} from "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Supply.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title ComputeToken
/// @notice Permanently funded compute on Monad, as a token. Each token id is one VM size on the corpus platform
/// (Fly-modeled sizes: shared-cpu-1x 1 GB and so on), and one token is one permanently funded machine of that
/// size: a corpus position whose principal is never spent and whose yield pays the monthly bill for as long as
/// the position is open. The price is corpus's own underwriting, `P = k · C / r` (monthly cost C, yield rate r,
/// buffer k), split into a principal that throws off exactly the bill and a buffer that absorbs a bad stretch of
/// yield; both halves are recorded here so the on-chain record matches the corpus ledger. Minting is the
/// payment: the buyer pays the price in USDC, the USDC goes to the corpus treasury (and from there into the
/// Monad lending vault; see treasury/), and the buyer holds a transferable claim. Redeeming burns the token
/// and emits `Redeemed` with a reference to the corpus account that should receive the position; the corpus
/// watcher indexes that event and opens it. Between mint and redeem the token is an ordinary ERC-1155 and can
/// be held, sent or sold.
///
/// Roadmap, not in this contract: jobs routed to an unredeemed token's idle machine accrue their fee to the
/// holder, so a held token earns while it waits. That accrual attaches to the token id and holder recorded here.
///
/// `totalSupply(id)` is the outstanding liability for that size, in machines. The operator registers sizes from
/// the corpus catalog; a later version can price GPU sizes from FixingOracle instead.
contract ComputeToken is ERC1155, ERC1155Supply {
    using SafeERC20 for IERC20;

    struct VmType { string slug; string label; uint256 monthlyUsdc; uint256 principalUsdc; uint256 priceUsdc; bool active; }

    IERC20 public immutable usdc;   // 6 decimals
    address public operator;        // corpus platform
    address public treasury;        // receives mint payments
    VmType[] public types;          // id = index

    event TypeRegistered(uint256 indexed id, string slug, string label, uint256 monthlyUsdc, uint256 principalUsdc, uint256 priceUsdc);
    event PriceSet(uint256 indexed id, uint256 monthlyUsdc, uint256 principalUsdc, uint256 priceUsdc, bool active);
    event Minted(address indexed buyer, uint256 indexed id, uint256 qty, uint256 paidUsdc);
    event Redeemed(address indexed holder, uint256 indexed id, uint256 qty, bytes32 indexed accountRef);

    error NotOperator();
    error UnknownType();
    error Inactive();
    error ZeroQty();
    error BadPrice();

    modifier onlyOperator() { if (msg.sender != operator) revert NotOperator(); _; }

    constructor(IERC20 usdc_, address treasury_, string memory uri_) ERC1155(uri_) {
        usdc = usdc_; operator = msg.sender; treasury = treasury_;
    }

    /// @notice Register a VM size. All amounts are 6-decimal USDC: `monthlyUsdc` is the catalog bill the position
    /// funds, `principalUsdc` the never-spent half, `priceUsdc` what the buyer pays (principal plus buffer).
    function registerType(string calldata slug, string calldata label, uint256 monthlyUsdc, uint256 principalUsdc, uint256 priceUsdc) external onlyOperator returns (uint256 id) {
        if (priceUsdc < principalUsdc) revert BadPrice();
        types.push(VmType({ slug: slug, label: label, monthlyUsdc: monthlyUsdc, principalUsdc: principalUsdc, priceUsdc: priceUsdc, active: true }));
        id = types.length - 1;
        emit TypeRegistered(id, slug, label, monthlyUsdc, principalUsdc, priceUsdc);
    }

    /// @notice Re-underwrite a size for NEW mints. Existing tokens are unaffected: a token is a claim on a machine, not on a price.
    function setPrice(uint256 id, uint256 monthlyUsdc, uint256 principalUsdc, uint256 priceUsdc, bool active) external onlyOperator {
        if (id >= types.length) revert UnknownType();
        if (priceUsdc < principalUsdc) revert BadPrice();
        types[id].monthlyUsdc = monthlyUsdc; types[id].principalUsdc = principalUsdc; types[id].priceUsdc = priceUsdc; types[id].active = active;
        emit PriceSet(id, monthlyUsdc, principalUsdc, priceUsdc, active);
    }

    /// @notice Buy `qty` permanently funded machines of size `id`. The caller must have approved `qty × price` USDC.
    function mint(uint256 id, uint256 qty) external returns (uint256 paid) {
        if (id >= types.length) revert UnknownType();
        if (!types[id].active) revert Inactive();
        if (qty == 0) revert ZeroQty();
        paid = types[id].priceUsdc * qty;
        usdc.safeTransferFrom(msg.sender, treasury, paid);
        _mint(msg.sender, id, qty, "");
        emit Minted(msg.sender, id, qty, paid);
    }

    /// @notice Burn `qty` tokens of size `id` and ask corpus to open that many positions for `accountRef`
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
