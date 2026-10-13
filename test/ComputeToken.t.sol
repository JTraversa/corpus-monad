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
        S1_1G = token.registerType("s1-1g", "shared-cpu-1x 1 GB, 30 days", 30, 5_700_000); // $5.70, the catalog price
        usdc.mint(alice, 100e6);
        vm.prank(alice); usdc.approve(address(token), type(uint256).max);
    }

    function test_mintPaysCatalogPriceToTreasury() public {
        vm.prank(alice); uint256 paid = token.mint(S1_1G, 3);
        assertEq(paid, 17_100_000);
        assertEq(usdc.balanceOf(treasury), 17_100_000);
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
        token.setPrice(S1_1G, 1, true);
        token.setPrice(S1_1G, 6_000_000, false);
        vm.prank(alice); vm.expectRevert(ComputeToken.Inactive.selector);
        token.mint(S1_1G, 1);
    }

    function test_mintNeedsPayment() public {
        vm.prank(bob); vm.expectRevert();
        token.mint(S1_1G, 1);
    }
}
