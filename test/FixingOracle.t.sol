// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/FixingOracle.sol";

/// The vector below is a real fixing served by https://cloud.trycorpus.ai on 2026-10-01, signed by the
/// corpusAI publisher key (0x1b77aE05cd23C514A1De304b6b771513f6eFa780). The contract must accept it unchanged and reject any edit.
contract FixingOracleTest is Test {
    FixingOracle oracle;
    address constant PUBLISHER = 0x1b77aE05cd23C514A1De304b6b771513f6eFa780;
    bytes SIG = hex"4501b7130f418a8fff46e14037416d51e470cbe62ddfe02cb3f316e1ad1c66585140514ffe3dbe92ac99e81a5116ab5b3ad3bd3a3df8967a677fe3c8807eddc81c";

    function setUp() public { oracle = new FixingOracle(PUBLISHER); }

    function liveFixing() internal pure returns (FixingOracle.Fixing memory f) {
        f = FixingOracle.Fixing({ ticker: "CX.H100SXM.NEO", day: "2026-10-01", valueE18: 3900000000000000000, n: 13, methodology: "2026.09.14-2" });
    }

    function test_verifiesLiveSignature() public view {
        assertTrue(oracle.verify(liveFixing(), SIG));
        assertEq(oracle.recover(liveFixing(), SIG), PUBLISHER);
    }

    function test_rejectsTamperedValue() public view {
        FixingOracle.Fixing memory f = liveFixing(); f.valueE18 += 1;
        assertFalse(oracle.verify(f, SIG));
    }

    function test_postStoresAndIsIdempotent() public {
        oracle.post(liveFixing(), SIG);
        FixingOracle.Stored memory s = oracle.latest("CX.H100SXM.NEO");
        assertEq(s.valueE18, 3900000000000000000); assertEq(s.n, 13); assertEq(s.day, "2026-10-01");
        oracle.post(liveFixing(), SIG); // second post: no revert, no change
        assertEq(oracle.fixing("CX.H100SXM.NEO", "2026-10-01").valueE18, 3900000000000000000);
    }

    function test_rejectsUnsignedPost() public {
        FixingOracle.Fixing memory f = liveFixing(); f.valueE18 = 1e18;
        vm.expectRevert();
        oracle.post(f, SIG);
    }

}
