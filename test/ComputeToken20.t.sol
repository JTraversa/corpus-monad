// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/ComputeToken.sol";
import "../src/ComputeToken20.sol";
import "./MockUSDC.sol";

contract ComputeToken20Test is Test {
    MockUSDC usdc; ComputeToken token; ComputeToken20 w;
    address treasury = address(0xBEEF); address alice = address(0xA11CE);

    function setUp() public {
        usdc = new MockUSDC();
        token = new ComputeToken(IERC20(address(usdc)), treasury, "https://cloud.trycorpus.ai/token/{id}.json");
        token.registerType("s1-256", "shared-cpu-1x 256 MB", 3_190_000, 528_730_000, 608_040_000);
        w = new ComputeToken20(IERC1155(address(token)), 0, "corpus s1-256 machine", "cS1-256");
        token.issue(alice, 0, 2, "seed");
    }

    function test_wrapAndUnwrapRoundTrip() public {
        vm.startPrank(alice);
        token.setApprovalForAll(address(w), true);
        w.wrap(2);
        assertEq(w.balanceOf(alice), 2e18);
        assertEq(token.balanceOf(address(w), 0), 2);
        w.unwrap(1);
        assertEq(w.balanceOf(alice), 1e18);
        assertEq(token.balanceOf(alice, 0), 1);
        vm.stopPrank();
    }

    function test_unwrapNeedsWholeUnits() public {
        vm.startPrank(alice);
        token.setApprovalForAll(address(w), true);
        w.wrap(1);
        w.transfer(address(0xB0B), 5e17); // half a machine moved away
        vm.expectRevert();
        w.unwrap(1);
        vm.stopPrank();
    }
}
