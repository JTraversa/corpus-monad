// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/FixingOracle.sol";
import "../src/ComputeToken.sol";
import "../test/MockUSDC.sol";

/// forge script script/Deploy.s.sol --rpc-url $MONAD_RPC --broadcast --private-key $DEPLOYER_KEY
/// PUBLISHER = corpusAI publisher address (default: the live one). USDC = USDC on the target chain (default: Monad
/// mainnet USDC); set MOCK_USDC=1 on a testnet to deploy a mock instead. TREASURY = where mint payments go (default: deployer).
contract Deploy is Script {
    struct Size { string slug; string label; uint256 cents; }

    function catalog() internal pure returns (Size[10] memory s) {
        // corpus catalog, monthly price per size (corpus-website src/app/catalog.js, mirrored from corpus-api routes/machines.rs)
        s[0] = Size("s1-256", "shared-cpu-1x 256 MB", 319);
        s[1] = Size("s1-512", "shared-cpu-1x 512 MB", 434);
        s[2] = Size("s1-1g",  "shared-cpu-1x 1 GB",   570);
        s[3] = Size("s1-2g",  "shared-cpu-1x 2 GB",   842);
        s[4] = Size("s2-2g",  "shared-cpu-2x 2 GB",   1272);
        s[5] = Size("s4-4g",  "shared-cpu-4x 4 GB",   2543);
        s[6] = Size("s8-8g",  "shared-cpu-8x 8 GB",   5086);
        s[7] = Size("p1-2g",  "performance-1x 2 GB",  3100);
        s[8] = Size("p2-4g",  "performance-2x 4 GB",  6200);
        s[9] = Size("p4-8g",  "performance-4x 8 GB",  12400);
    }

    // corpus underwriting, mirrored from corpus-api routes/funding.rs and corpus-website src/app/catalog.js:
    // price = k·C/r and principal = C/r, each rounded from the ANNUAL cost; the buffer is the remainder.
    uint256 constant YIELD_RATE_BPS = 724;   // r = 7.24 %
    uint256 constant BUFFER_K_BPS = 11_500;  // k = 1.15
    function divRound(uint256 a, uint256 b) internal pure returns (uint256) { return (a + b / 2) / b; }
    function split(uint256 monthlyCents) internal pure returns (uint256 principalCents, uint256 priceCents) {
        uint256 annual = monthlyCents * 12;
        principalCents = divRound(annual * 10_000, YIELD_RATE_BPS);
        priceCents = divRound(annual * BUFFER_K_BPS, YIELD_RATE_BPS);
    }

    function run() external {
        address publisher = vm.envOr("PUBLISHER", address(0x1b77aE05cd23C514A1De304b6b771513f6eFa780));
        address usdc = vm.envOr("USDC", address(0x754704Bc059F8C67012fEd69BC8A327a5aafb603));
        vm.startBroadcast();
        address treasury = vm.envOr("TREASURY", msg.sender);
        if (vm.envOr("MOCK_USDC", false)) usdc = address(new MockUSDC());
        FixingOracle oracle = new FixingOracle(publisher);
        ComputeToken token = new ComputeToken(IERC20(usdc), treasury, "https://cloud.trycorpus.ai/token/{id}.json");
        Size[10] memory s = catalog();
        for (uint256 i = 0; i < s.length; i++) {
            (uint256 principalCents, uint256 priceCents) = split(s[i].cents);
            token.registerType(s[i].slug, s[i].label, s[i].cents * 10_000, principalCents * 10_000, priceCents * 10_000); // cents -> 6-decimal USDC
        }
        vm.stopBroadcast();
        console.log("USDC        ", usdc);
        console.log("FixingOracle", address(oracle));
        console.log("ComputeToken", address(token));
        console.log("treasury    ", treasury);
    }
}
