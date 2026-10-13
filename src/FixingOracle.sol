// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title FixingOracle
/// @notice Verifies and stores corpusAI Cloud Pricing index fixings on Monad.
///
/// Every fixing served by https://cloud.trycorpus.ai carries an EIP-712 signature by the corpusAI
/// publisher key over the struct below, under a domain WITHOUT chainId or verifyingContract
/// (name "corpusAI Cloud Pricing", version "1"), so the same signature verifies on any chain.
/// Anyone may relay a signed fixing here with `post`; the contract recovers the signer, checks it is
/// the publisher, and stores the value so other contracts can read it (settlement of compute forwards,
/// collateral valuation, SLA markets). A fixing never changes under one methodology version, and a
/// later-posted fixing for the same ticker and day must carry the same value.
contract FixingOracle {
    struct Fixing {
        string ticker;      // e.g. "CX.H100SXM.NEO"
        string day;         // "YYYY-MM-DD" (UTC)
        uint256 valueE18;   // USD per unit × 1e18
        uint32 n;           // eligible quotes behind the median
        string methodology; // methodology version, e.g. "2026.09.14-2"
    }

    struct Stored {
        uint256 valueE18;
        uint32 n;
        uint64 postedAt;
        string day;
        string methodology;
    }

    bytes32 private constant DOMAIN_TYPEHASH = keccak256("EIP712Domain(string name,string version)");
    bytes32 private constant FIXING_TYPEHASH =
        keccak256("Fixing(string ticker,string day,uint256 valueE18,uint32 n,string methodology)");
    bytes32 public immutable DOMAIN_SEPARATOR;

    address public publisher;
    address public owner;
    /// @dev keccak256(ticker) → keccak256(day) → fixing
    mapping(bytes32 => mapping(bytes32 => Stored)) private byDay;
    /// @dev keccak256(ticker) → latest day's fixing (by lexical day order, which is chronological for YYYY-MM-DD)
    mapping(bytes32 => Stored) private latestOf;

    event FixingPosted(bytes32 indexed tickerId, string ticker, string day, uint256 valueE18, uint32 n, string methodology, address relayer);
    event PublisherChanged(address indexed previous, address indexed current);

    error NotOwner();
    error BadSignature();
    error NotPublisher(address recovered);
    error Conflict(uint256 stored, uint256 posted);

    constructor(address publisher_) {
        owner = msg.sender;
        publisher = publisher_;
        DOMAIN_SEPARATOR = keccak256(abi.encode(DOMAIN_TYPEHASH, keccak256("corpusAI Cloud Pricing"), keccak256("1")));
    }

    /// @notice Hash of a fixing under the publisher's domain (what the publisher key signs).
    function hashFixing(Fixing calldata f) public view returns (bytes32) {
        bytes32 structHash = keccak256(abi.encode(
            FIXING_TYPEHASH,
            keccak256(bytes(f.ticker)),
            keccak256(bytes(f.day)),
            f.valueE18,
            f.n,
            keccak256(bytes(f.methodology))
        ));
        return keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));
    }

    /// @notice Recover the signer of a fixing signature.
    function recover(Fixing calldata f, bytes calldata sig) public view returns (address) {
        if (sig.length != 65) revert BadSignature();
        bytes32 r; bytes32 s; uint8 v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        if (v < 27) v += 27;
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) revert BadSignature();
        address a = ecrecover(hashFixing(f), v, r, s);
        if (a == address(0)) revert BadSignature();
        return a;
    }

    /// @notice True if `sig` is the publisher's signature over `f`. Pure verification, no storage.
    function verify(Fixing calldata f, bytes calldata sig) external view returns (bool) {
        return recover(f, sig) == publisher;
    }

    /// @notice Relay a publisher-signed fixing on chain. Permissionless; the signature is the authority.
    function post(Fixing calldata f, bytes calldata sig) external {
        address a = recover(f, sig);
        if (a != publisher) revert NotPublisher(a);
        bytes32 t = keccak256(bytes(f.ticker));
        bytes32 d = keccak256(bytes(f.day));
        Stored storage cur = byDay[t][d];
        if (cur.postedAt != 0) {
            if (cur.valueE18 != f.valueE18) revert Conflict(cur.valueE18, f.valueE18);
            return; // already posted, idempotent
        }
        byDay[t][d] = Stored({ valueE18: f.valueE18, n: f.n, postedAt: uint64(block.timestamp), day: f.day, methodology: f.methodology });
        Stored storage l = latestOf[t];
        if (l.postedAt == 0 || _later(f.day, l.day)) latestOf[t] = byDay[t][d];
        emit FixingPosted(t, f.ticker, f.day, f.valueE18, f.n, f.methodology, msg.sender);
    }

    /// @notice Fixing for a ticker on a day; postedAt == 0 means not posted.
    function fixing(string calldata ticker, string calldata day) external view returns (Stored memory) {
        return byDay[keccak256(bytes(ticker))][keccak256(bytes(day))];
    }

    /// @notice Latest posted fixing for a ticker.
    function latest(string calldata ticker) external view returns (Stored memory) {
        return latestOf[keccak256(bytes(ticker))];
    }

    function setPublisher(address next) external {
        if (msg.sender != owner) revert NotOwner();
        emit PublisherChanged(publisher, next);
        publisher = next;
    }

    function transferOwnership(address next) external {
        if (msg.sender != owner) revert NotOwner();
        owner = next;
    }

    /// @dev lexical compare of "YYYY-MM-DD" strings
    function _later(string memory a, string memory b) private pure returns (bool) {
        bytes memory x = bytes(a); bytes memory y = bytes(b);
        uint256 n = x.length < y.length ? x.length : y.length;
        for (uint256 i = 0; i < n; i++) { if (x[i] != y[i]) return x[i] > y[i]; }
        return x.length > y.length;
    }
}
