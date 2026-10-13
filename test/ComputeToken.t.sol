// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/ComputeToken.sol";
import "./MockUSDC.sol";

contract ComputeTokenTest is Test {
    MockUSDC usdc; ComputeToken token;
    address treasury = address(0xBEEF); address alice = address(0xA11CE); address bob = address(0xB0B);
    uint256 S1_1G;

    function setUp() public {
        usdc = new MockUSDC();
        token = new ComputeToken(IERC20(address(usdc)), treasury, "https://cloud.trycorpus.ai/token/{id}.json");
        // shared-cpu-1x 1 GB: $5.70 a month -> principal $944.75, price $1,086.46 (k = 1.15, r = 7.24 %), as corpus quotes it
        S1_1G = token.registerType("s1-1g", "shared-cpu-1x 1 GB", 5_700_000, 944_750_000, 1_086_460_000);
        usdc.mint(alice, 10_000e6);
        vm.prank(alice); usdc.approve(address(token), type(uint256).max);
    }

    function test_mintPaysCatalogPriceToTreasury() public {
        vm.prank(alice); uint256 paid = token.mint(S1_1G, 3);
        assertEq(paid, 3 * 1_086_460_000);
        assertEq(usdc.balanceOf(treasury), 3 * 1_086_460_000);
        assertEq(token.balanceOf(alice, S1_1G), 3);
        assertEq(token.totalSupply(S1_1G), 3);
    }

    function test_tokenIsTransferable() public {
        vm.prank(alice); token.mint(S1_1G, 2);
        vm.prank(alice); token.safeTransferFrom(alice, bob, S1_1G, 1, "");
        assertEq(token.balanceOf(bob, S1_1G), 1);
    }

    function test_redeemBurnsAndEmitsAccountRef() public {
        vm.prank(alice); token.mint(S1_1G, 2);
        bytes32 ref = keccak256("corpus-account-42");
        vm.expectEmit(true, true, true, true);
        emit ComputeToken.Redeemed(alice, S1_1G, 1, ref);
        vm.prank(alice); token.redeem(S1_1G, 1, ref);
        assertEq(token.balanceOf(alice, S1_1G), 1);
        assertEq(token.totalSupply(S1_1G), 1); // outstanding liability
    }

    function test_cannotRedeemMoreThanHeld() public {
        vm.prank(alice); token.mint(S1_1G, 1);
        vm.prank(alice); vm.expectRevert();
        token.redeem(S1_1G, 2, bytes32(0));
    }

    function test_onlyOperatorPrices() public {
        vm.prank(alice); vm.expectRevert(ComputeToken.NotOperator.selector);
        token.setPrice(S1_1G, 1, 1, 1, true);
        vm.expectRevert(ComputeToken.BadPrice.selector);
        token.setPrice(S1_1G, 5_700_000, 944_750_000, 900_000_000, true); // price below principal
        token.setPrice(S1_1G, 5_700_000, 944_750_000, 1_086_460_000, false);
        vm.prank(alice); vm.expectRevert(ComputeToken.Inactive.selector);
        token.mint(S1_1G, 1);
    }

    function test_priceIsPrincipalPlusBuffer() public view {
        (, , uint256 monthly, uint256 principal, uint256 price, ) = token.types(S1_1G);
        assertEq(monthly, 5_700_000);
        assertEq(price - principal, 141_710_000); // the buffer, (k-1)·C/r
        // principal's yield at r covers the bill: 944.75 × 7.24 % = 68.40 a year = 5.70 × 12
        assertApproxEqAbs(principal * 724 / 10_000 / 12, monthly, 10); // within 0.00001 USDC of the bill
    }

    function test_mintNeedsPayment() public {
        vm.prank(bob); vm.expectRevert();
        token.mint(S1_1G, 1);
    }
}
