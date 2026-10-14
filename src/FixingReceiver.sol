// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FixingOracle} from "./FixingOracle.sol";

/// @title FixingReceiver
/// @notice The on-chain end of the Chainlink CRE relay workflow (cre/relay-fixing). The CRE forwarder calls
/// `onReport` with the workflow's report, which is `abi.encode(Fixing, signature)` exactly as served by the feed;
/// the receiver hands it to FixingOracle.post, which verifies the publisher's EIP-712 signature itself. So the
/// receiver needs no trust in the forwarder: a bad report fails signature recovery in the oracle. `forwarder`
/// is recorded for information and can be enforced by the owner once the Monad forwarder address is known.
contract FixingReceiver {
    FixingOracle public immutable oracle;
    address public owner;
    address public forwarder;      // zero = accept from anyone (the oracle's signature check is the guard)
    uint256 public reportsAccepted;

    event ReportRelayed(string ticker, string day, uint256 valueE18, address indexed sender);
    error NotOwner();
    error NotForwarder();

    constructor(FixingOracle oracle_) { oracle = oracle_; owner = msg.sender; }

    /// @notice IReceiver entrypoint used by the Chainlink Keystone forwarder.
    function onReport(bytes calldata, bytes calldata report) external {
        if (forwarder != address(0) && msg.sender != forwarder) revert NotForwarder();
        (FixingOracle.Fixing memory f, bytes memory sig) = abi.decode(report, (FixingOracle.Fixing, bytes));
        oracle.post(f, sig);
        reportsAccepted += 1;
        emit ReportRelayed(f.ticker, f.day, f.valueE18, msg.sender);
    }

    function setForwarder(address next) external { if (msg.sender != owner) revert NotOwner(); forwarder = next; }
    function supportsInterface(bytes4 id) external pure returns (bool) { return id == 0x01ffc9a7 || id == this.onReport.selector; }
}
