// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {SemvioDealRoom} from "../src/SemvioDealRoom.sol";
import {SemvioFeeMath as M} from "../src/SemvioFeeMath.sol";
import {SemvioTestToken} from "./SemvioMocks.sol";

/// @notice Library wrapper so fuzzing can call internal functions.
contract SemvioMathHarness {
    function feeOf(uint256 g, uint16 b) external pure returns (uint256) {
        return M.feeOf(g, b);
    }

    function netOf(uint256 g, uint16 b) external pure returns (uint256) {
        return M.netOf(g, b);
    }

    function minGrossForNet(uint256 n, uint16 b) external pure returns (uint256) {
        return M.minGrossForNet(n, b);
    }
}

contract SemvioFuzzTest is Test {
    SemvioMathHarness h = new SemvioMathHarness();
    SemvioDealRoom room;
    SemvioTestToken base;
    SemvioTestToken quoteTok;

    function setUp() public {
        vm.warp(1_800_000_000);
        room = new SemvioDealRoom();
        base = new SemvioTestToken("Base", "BASE", 18);
        quoteTok = new SemvioTestToken("Quote", "QUOTE", 6);
    }

    function testFuzz_feeSplitsExactly(uint128 gross, uint16 bps) public view {
        bps = uint16(bound(bps, 0, M.MAX_FEE_BPS));
        uint256 fee = h.feeOf(gross, bps);
        uint256 net = h.netOf(gross, bps);
        assertEq(fee + net, gross);
        assertLe(fee * 10_000, uint256(gross) * bps);
        assertLe(fee, uint256(gross) / 100);
    }

    function testFuzz_minGrossIsSmallest(uint128 net, uint16 bps) public view {
        bps = uint16(bound(bps, 0, M.MAX_FEE_BPS));
        net = uint128(bound(net, 1, type(uint112).max));
        uint256 g = h.minGrossForNet(net, bps);
        assertGe(h.netOf(g, bps), net);
        assertLt(h.netOf(g - 1, bps), net);
    }

    address constant S = address(0x51);
    address constant B = address(0xB1);
    address constant FR = address(0xF1);

    function _openFuzz(uint128 baseAmt, uint128 gross, uint16 bps, bool makerIsSeller) internal returns (uint256 id) {
        base.mint(S, baseAmt);
        quoteTok.mint(B, gross);
        vm.prank(S);
        base.approve(address(room), baseAmt);
        vm.prank(B);
        quoteTok.approve(address(room), gross);
        SemvioDealRoom.OpenParams memory p = SemvioDealRoom.OpenParams({
            counterparty: makerIsSeller ? B : S,
            makerIsSeller: makerIsSeller,
            baseToken: address(base),
            quoteToken: address(quoteTok),
            baseAmount: baseAmt,
            validUntil: uint64(block.timestamp + 1 days),
            ref: bytes32(0),
            makerAgent: address(0),
            approve: true
        });
        M.Terms memory t = M.Terms(gross, bps, bps == 0 ? address(0) : FR, uint64(block.timestamp + 1 hours), bytes32(0));
        vm.prank(makerIsSeller ? S : B);
        id = room.openDeal(p, t);
    }

    function testFuzz_settlementConserves(uint128 baseAmt, uint128 gross, uint16 bps, bool makerIsSeller) public {
        baseAmt = uint128(bound(baseAmt, 1, 1e30));
        gross = uint128(bound(gross, 1, 1e24));
        bps = uint16(bound(bps, 0, M.MAX_FEE_BPS));
        uint256 id = _openFuzz(baseAmt, gross, bps, makerIsSeller);
        uint256 net = h.netOf(gross, bps);
        assertEq(room.checkDeal(id, gross, net), makerIsSeller ? M.R_BUYER_NOT_APPROVED : M.R_SELLER_NOT_APPROVED);
        (SemvioDealRoom.Deal memory d,) = room.getDeal(id);
        vm.prank(makerIsSeller ? B : S);
        room.approveAndSettle(id, 1, d.lastHash);
        assertEq(base.balanceOf(B), baseAmt);
        assertEq(base.balanceOf(S), 0);
        assertEq(quoteTok.balanceOf(S), net);
        assertEq(quoteTok.balanceOf(FR), gross - net);
        assertEq(quoteTok.balanceOf(address(room)), 0);
        assertEq(base.balanceOf(address(room)), 0);
    }
}

/// @notice Random sequences of opens, proposals, approvals, withdrawals, cancels and settlements between three wallets.
contract SemvioHandler is Test {
    SemvioDealRoom public room;
    SemvioTestToken public base;
    SemvioTestToken public quoteTok;
    address[3] public actors = [address(0xA1), address(0xA2), address(0xA3)];
    address public feeTo = address(0xFEE1);
    uint256 public settledCount;
    mapping(uint256 => bytes32) public settledHash;
    uint256[] public settledIds;

    constructor(SemvioDealRoom r, SemvioTestToken b, SemvioTestToken q) {
        room = r;
        base = b;
        quoteTok = q;
        for (uint256 i; i < 3; i++) {
            b.mint(actors[i], 1e30);
            q.mint(actors[i], 1e30);
            vm.startPrank(actors[i]);
            b.approve(address(r), type(uint256).max);
            q.approve(address(r), type(uint256).max);
            vm.stopPrank();
        }
    }

    function _deal(uint256 seed) internal view returns (uint256 id) {
        uint256 n = room.dealCount();
        if (n == 0) return 0;
        return (seed % n) + 1;
    }

    function open(uint256 a, uint256 c, uint128 amt, uint128 gross, uint16 bps, bool sellerMaker) external {
        address m = actors[a % 3];
        address cp = actors[c % 3];
        if (m == cp) return;
        bps = uint16(bound(bps, 0, 100));
        SemvioDealRoom.OpenParams memory p = SemvioDealRoom.OpenParams(cp, sellerMaker, address(base), address(quoteTok), uint128(bound(amt, 1, 1e24)), uint64(block.timestamp + 2 days), bytes32(0), address(0), a % 2 == 0);
        M.Terms memory t = M.Terms(uint128(bound(gross, 1, 1e24)), bps, bps == 0 ? address(0) : feeTo, uint64(block.timestamp + 1 days), bytes32(0));
        vm.prank(m);
        room.openDeal(p, t);
    }

    function propose(uint256 seed, uint256 who, uint128 gross, bool alsoApprove) external {
        uint256 id = _deal(seed);
        if (id == 0) return;
        (SemvioDealRoom.Deal memory d,) = room.getDeal(id);
        M.Terms memory t = M.Terms(uint128(bound(gross, 1, 1e24)), 0, address(0), uint64(block.timestamp + 1 hours), bytes32(seed));
        vm.prank(actors[who % 3]);
        try room.proposeRevision(id, d.revision, t, alsoApprove) {} catch {}
    }

    function approve(uint256 seed, uint256 who, bool andSettle) external {
        uint256 id = _deal(seed);
        if (id == 0) return;
        (SemvioDealRoom.Deal memory d,) = room.getDeal(id);
        vm.prank(actors[who % 3]);
        if (andSettle) {
            try room.approveAndSettle(id, d.revision, d.lastHash) {
                _settled(id, d.lastHash);
            } catch {}
        } else {
            try room.approve(id, d.revision, d.lastHash) {} catch {}
        }
    }

    function settle(uint256 seed, uint256 who, bool stale) external {
        uint256 id = _deal(seed);
        if (id == 0) return;
        (SemvioDealRoom.Deal memory d,) = room.getDeal(id);
        bytes32 h = stale ? bytes32(uint256(d.lastHash) ^ 1) : d.lastHash;
        vm.prank(actors[who % 3]);
        try room.settle(id, d.revision, h) {
            _settled(id, h);
        } catch {}
    }

    function withdraw(uint256 seed, uint256 who) external {
        uint256 id = _deal(seed);
        if (id == 0) return;
        vm.prank(actors[who % 3]);
        try room.withdrawApproval(id) {} catch {}
    }

    function cancel(uint256 seed, uint256 who) external {
        uint256 id = _deal(seed);
        if (id == 0) return;
        vm.prank(actors[who % 3]);
        try room.cancel(id) {} catch {}
    }

    function warp(uint32 s) external {
        vm.warp(block.timestamp + bound(s, 0, 6 hours));
    }

    function _settled(uint256 id, bytes32 h) internal {
        settledCount++;
        settledHash[id] = h;
        settledIds.push(id);
    }

    function settledLength() external view returns (uint256) {
        return settledIds.length;
    }
}

contract SemvioInvariantTest is Test {
    SemvioDealRoom room;
    SemvioTestToken base;
    SemvioTestToken quoteTok;
    SemvioHandler handler;

    function setUp() public {
        vm.warp(1_800_000_000);
        room = new SemvioDealRoom();
        base = new SemvioTestToken("Base", "BASE", 18);
        quoteTok = new SemvioTestToken("Quote", "QUOTE", 6);
        handler = new SemvioHandler(room, base, quoteTok);
        targetContract(address(handler));
    }

    /// The room never holds a balance.
    function invariant_roomHoldsNothing() public view {
        assertEq(base.balanceOf(address(room)), 0);
        assertEq(quoteTok.balanceOf(address(room)), 0);
    }

    /// Tokens are only moved between wallets, never created or lost.
    function invariant_supplyConserved() public view {
        uint256 sb;
        uint256 sq;
        for (uint256 i; i < 3; i++) {
            sb += base.balanceOf(handler.actors(i));
            sq += quoteTok.balanceOf(handler.actors(i));
        }
        assertEq(sb, base.totalSupply());
        assertEq(sq + quoteTok.balanceOf(handler.feeTo()), quoteTok.totalSupply());
    }

    /// A settled deal settled exactly the revision both parties approved, and its hash matches the stored chain.
    function invariant_settledMeansBothApprovedCurrent() public view {
        uint256 n = handler.settledLength();
        for (uint256 i; i < n; i++) {
            uint256 id = handler.settledIds(i);
            (SemvioDealRoom.Deal memory d,) = room.getDeal(id);
            assertEq(uint8(d.status), uint8(SemvioDealRoom.Status.Settled));
            assertEq(d.sellerApproved, d.revision);
            assertEq(d.buyerApproved, d.revision);
            assertEq(handler.settledHash(id), d.lastHash);
            assertEq(room.revisionHashOf(id, d.revision), d.lastHash);
        }
    }

    /// Approvals never point past the current revision, and stored hashes are never zero.
    function invariant_approvalsWithinRevisions() public view {
        uint256 n = room.dealCount();
        for (uint256 id = 1; id <= n; id++) {
            (SemvioDealRoom.Deal memory d,) = room.getDeal(id);
            assertLe(d.sellerApproved, d.revision);
            assertLe(d.buyerApproved, d.revision);
            assertTrue(d.revision >= 1 && d.revision <= room.MAX_REVISIONS());
            assertTrue(room.revisionHashOf(id, d.revision) != bytes32(0));
        }
    }
}
