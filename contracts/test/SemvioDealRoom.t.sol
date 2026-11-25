// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {SemvioDealRoom} from "../src/SemvioDealRoom.sol";
import {SemvioFeeMath as M} from "../src/SemvioFeeMath.sol";
import {
    SemvioTestToken,
    SemvioNoReturnToken,
    SemvioFalseToken,
    SemvioFeeToken,
    SemvioLiarToken,
    SemvioReentrantToken
} from "./SemvioMocks.sol";

contract SemvioDealRoomTest is Test {
    SemvioDealRoom room;
    SemvioTestToken weth;
    SemvioTestToken usdg;

    address seller = address(0x5E11);
    address buyer = address(0xB0B);
    address sellerAgent = address(0xA9E1);
    address buyerAgent = address(0xA9E2);
    address broker = address(0xFEE);
    address stranger = address(0xBAD);

    uint128 constant BASE = 5e18; // 5 WETH
    uint128 constant GROSS = 15_000e6; // 15,000 USDG

    function setUp() public {
        vm.warp(1_800_000_000);
        room = new SemvioDealRoom();
        weth = new SemvioTestToken("Wrapped Ether", "WETH", 18);
        usdg = new SemvioTestToken("Global Dollar", "USDG", 6);
        weth.mint(seller, 100e18);
        usdg.mint(buyer, 1_000_000e6);
        vm.prank(seller);
        weth.approve(address(room), type(uint256).max);
        vm.prank(buyer);
        usdg.approve(address(room), type(uint256).max);
    }

    // ---- helpers ---------------------------------------------------------------------------------------------

    function _terms(uint128 gross, uint16 bps, address rcpt) internal view returns (M.Terms memory) {
        return M.Terms({quoteAmount: gross, feeBps: bps, feeRecipient: rcpt, offerValidUntil: uint64(block.timestamp + 1 days), noteHash: keccak256("note")});
    }

    function _params(address counterparty, bool makerIsSeller, address agent, bool approveFirst) internal view returns (SemvioDealRoom.OpenParams memory) {
        return SemvioDealRoom.OpenParams({
            counterparty: counterparty,
            makerIsSeller: makerIsSeller,
            baseToken: address(weth),
            quoteToken: address(usdg),
            baseAmount: BASE,
            validUntil: uint64(block.timestamp + 7 days),
            ref: keccak256("request-1"),
            makerAgent: agent,
            approve: approveFirst
        });
    }

    function _open() internal returns (uint256 id) {
        vm.prank(seller);
        id = room.openDeal(_params(buyer, true, sellerAgent, true), _terms(GROSS, 0, address(0)));
    }

    function _current(uint256 id) internal view returns (uint32 rev, bytes32 h) {
        (SemvioDealRoom.Deal memory d,) = room.getDeal(id);
        return (d.revision, d.lastHash);
    }

    function _bits(bytes memory err) internal pure returns (uint256 bits) {
        require(bytes4(err) == SemvioDealRoom.SemvioRefused.selector, "not a refusal");
        assembly {
            bits := mload(add(err, 36))
        }
    }

    function _expectBits(uint256 bits) internal {
        vm.expectRevert(abi.encodeWithSelector(SemvioDealRoom.SemvioRefused.selector, bits));
    }

    // ---- happy path ------------------------------------------------------------------------------------------

    function test_openRecordsDealAndFirstRevision() public {
        uint256 id = _open();
        (SemvioDealRoom.Deal memory d, M.Terms memory t) = room.getDeal(id);
        assertEq(d.seller, seller);
        assertEq(d.buyer, buyer);
        assertEq(d.maker, seller);
        assertEq(d.revision, 1);
        assertEq(d.sellerApproved, 1);
        assertEq(d.buyerApproved, 0);
        assertEq(d.sellerAgent, sellerAgent);
        assertEq(uint8(d.status), uint8(SemvioDealRoom.Status.Open));
        assertEq(t.quoteAmount, GROSS);
        bytes32 dh = room.dealHashOf(id);
        bytes32 expected = M.revisionHash(dh, id, 1, seller, true, t);
        assertEq(d.lastHash, expected);
        assertEq(room.revisionHashOf(id, 1), expected);
        assertEq(room.dealsOf(seller).length, 1);
        assertEq(room.dealsOf(buyer)[0], id);
    }

    function test_twoSidedApprovalSettlesAtomically() public {
        uint256 id = _open();
        (uint32 rev, bytes32 h) = _current(id);
        uint256 s0 = usdg.balanceOf(seller);
        vm.prank(buyer);
        room.approveAndSettle(id, rev, h);
        assertEq(weth.balanceOf(buyer), BASE);
        assertEq(usdg.balanceOf(seller) - s0, GROSS);
        assertEq(weth.balanceOf(address(room)), 0);
        assertEq(usdg.balanceOf(address(room)), 0);
        (SemvioDealRoom.Deal memory d,) = room.getDeal(id);
        assertEq(uint8(d.status), uint8(SemvioDealRoom.Status.Settled));
    }

    function test_feeGoesToNamedRecipientAndSellerGetsNet() public {
        vm.prank(seller);
        uint256 id = room.openDeal(_params(buyer, true, address(0), true), _terms(GROSS, 25, broker));
        (uint32 rev, bytes32 h) = _current(id);
        vm.prank(buyer);
        room.approveAndSettle(id, rev, h);
        uint256 fee = (uint256(GROSS) * 25) / 10_000;
        assertEq(usdg.balanceOf(broker), fee);
        assertEq(usdg.balanceOf(seller), GROSS - fee);
        assertEq(usdg.balanceOf(buyer), 1_000_000e6 - GROSS);
    }

    function test_buyerOpensSellerSettles() public {
        vm.prank(buyer);
        uint256 id = room.openDeal(_params(seller, false, buyerAgent, true), _terms(GROSS, 0, address(0)));
        (SemvioDealRoom.Deal memory d,) = room.getDeal(id);
        assertEq(d.seller, seller);
        assertEq(d.buyer, buyer);
        assertEq(d.buyerApproved, 1);
        assertEq(d.buyerAgent, buyerAgent);
        vm.prank(seller);
        room.approveAndSettle(id, 1, d.lastHash);
        assertEq(weth.balanceOf(buyer), BASE);
    }

    function test_dealsOfPageNewestFirst() public {
        for (uint256 i; i < 5; i++) _open();
        uint256[] memory p = room.dealsOfPage(buyer, 1, 2);
        assertEq(p.length, 2);
        assertEq(p[0], 4);
        assertEq(p[1], 3);
        assertEq(room.dealsOfPage(buyer, 4, 10).length, 1);
        assertEq(room.dealsOfPage(buyer, 5, 10).length, 0);
        assertEq(room.dealsOfCount(buyer), 5);
    }

    // ---- revisions ---------------------------------------------------------------------------------------------

    function test_newRevisionVoidsOldApprovals() public {
        uint256 id = _open();
        (uint32 rev1, bytes32 h1) = _current(id);
        vm.prank(buyer);
        room.approve(id, rev1, h1);
        // Agent of the seller counters: both approvals now point at revision 1, so nothing can settle.
        vm.prank(sellerAgent);
        room.proposeRevision(id, rev1, _terms(GROSS + 100e6, 0, address(0)), false);
        (uint32 rev2, bytes32 h2) = _current(id);
        assertEq(rev2, 2);
        uint256 bits = room.checkDeal(id, 0, 0);
        assertTrue(bits & M.R_SELLER_NOT_APPROVED != 0);
        assertTrue(bits & M.R_BUYER_NOT_APPROVED != 0);
        // Settling the old revision is refused as stale.
        vm.prank(buyer);
        _expectBits(M.R_STALE_REVISION);
        room.settle(id, rev1, h1);
        // Hash chain: revision 2 links to revision 1.
        (, M.Terms memory t2) = room.getDeal(id);
        assertEq(h2, M.revisionHash(h1, id, 2, sellerAgent, true, t2));
    }

    function test_settlesOnlyRevisionBothApproved() public {
        uint256 id = _open();
        vm.prank(buyerAgent);
        vm.expectRevert(abi.encodeWithSelector(SemvioDealRoom.SemvioRefused.selector, M.R_NOT_PARTY));
        room.proposeRevision(id, 1, _terms(GROSS - 500e6, 0, address(0)), false); // not appointed yet
        vm.prank(buyer);
        room.setAgent(id, buyerAgent);
        vm.prank(buyerAgent);
        room.proposeRevision(id, 1, _terms(GROSS - 500e6, 0, address(0)), false);
        (uint32 rev, bytes32 h) = _current(id);
        vm.prank(buyer);
        room.approve(id, rev, h);
        // Seller approved revision 1 only: settle refuses.
        vm.prank(buyer);
        _expectBits(M.R_SELLER_NOT_APPROVED);
        room.settle(id, rev, h);
        vm.prank(seller);
        room.approveAndSettle(id, rev, h);
        assertEq(usdg.balanceOf(seller), GROSS - 500e6);
    }

    function test_proposerCanApproveOwnRevisionAgentCannot() public {
        uint256 id = _open();
        vm.prank(buyer);
        room.proposeRevision(id, 1, _terms(GROSS - 1e6, 0, address(0)), true);
        (SemvioDealRoom.Deal memory d,) = room.getDeal(id);
        assertEq(d.buyerApproved, 2);
        vm.prank(sellerAgent);
        _expectBits(M.R_NOT_PARTY);
        room.proposeRevision(id, 2, _terms(GROSS, 0, address(0)), true);
    }

    function test_staleExpectedRevisionRefused() public {
        uint256 id = _open();
        vm.prank(buyer);
        room.proposeRevision(id, 1, _terms(GROSS - 1e6, 0, address(0)), false);
        vm.prank(seller);
        _expectBits(M.R_STALE_REVISION);
        room.proposeRevision(id, 1, _terms(GROSS, 0, address(0)), false);
    }

    function test_revisionLimit() public {
        uint256 id = _open();
        uint32 max = room.MAX_REVISIONS();
        for (uint32 r = 1; r < max; r++) {
            vm.prank(r % 2 == 0 ? seller : buyer);
            room.proposeRevision(id, r, _terms(GROSS + r, 0, address(0)), false);
        }
        vm.prank(buyer);
        _expectBits(M.R_REVISION_LIMIT);
        room.proposeRevision(id, max, _terms(GROSS, 0, address(0)), false);
    }

    // ---- terms checks ----------------------------------------------------------------------------------------

    function test_feeAboveCapRefused() public {
        vm.prank(seller);
        _expectBits(M.R_FEE_OVER_CAP);
        room.openDeal(_params(buyer, true, address(0), false), _terms(GROSS, 101, broker));
    }

    function test_feeRecipientRules() public {
        vm.startPrank(seller);
        _expectBits(M.R_BAD_FEE_RECIPIENT);
        room.openDeal(_params(buyer, true, address(0), false), _terms(GROSS, 10, address(0)));
        _expectBits(M.R_BAD_FEE_RECIPIENT);
        room.openDeal(_params(buyer, true, address(0), false), _terms(GROSS, 10, buyer));
        _expectBits(M.R_BAD_FEE_RECIPIENT);
        room.openDeal(_params(buyer, true, address(0), false), _terms(GROSS, 10, seller));
        _expectBits(M.R_BAD_FEE_RECIPIENT);
        room.openDeal(_params(buyer, true, address(0), false), _terms(GROSS, 0, broker));
        vm.stopPrank();
    }

    function test_offerWindowMustSitInsideDeal() public {
        M.Terms memory t = _terms(GROSS, 0, address(0));
        t.offerValidUntil = uint64(block.timestamp + 8 days);
        vm.prank(seller);
        _expectBits(M.R_OFFER_WINDOW);
        room.openDeal(_params(buyer, true, address(0), false), t);
    }

    function test_zeroAmountsAndNoCode() public {
        SemvioDealRoom.OpenParams memory p = _params(buyer, true, address(0), false);
        p.baseAmount = 0;
        p.baseToken = address(0x1234);
        vm.prank(seller);
        _expectBits(M.R_ZERO_AMOUNT | M.R_TOKEN_NO_CODE);
        room.openDeal(p, _terms(GROSS, 0, address(0)));
        vm.prank(seller);
        _expectBits(M.R_ZERO_AMOUNT);
        room.openDeal(_params(buyer, true, address(0), false), _terms(0, 0, address(0)));
    }

    function test_badOpenShapes() public {
        vm.startPrank(seller);
        vm.expectRevert(SemvioDealRoom.SemvioBadDeal.selector);
        room.openDeal(_params(seller, true, address(0), false), _terms(GROSS, 0, address(0)));
        vm.expectRevert(SemvioDealRoom.SemvioBadDeal.selector);
        room.openDeal(_params(address(0), true, address(0), false), _terms(GROSS, 0, address(0)));
        vm.expectRevert(SemvioDealRoom.SemvioBadDeal.selector);
        room.openDeal(_params(buyer, true, buyer, false), _terms(GROSS, 0, address(0)));
        SemvioDealRoom.OpenParams memory p = _params(buyer, true, address(0), false);
        p.validUntil = uint64(block.timestamp + 31 days);
        vm.expectRevert(SemvioDealRoom.SemvioBadDeal.selector);
        room.openDeal(p, _terms(GROSS, 0, address(0)));
        p = _params(buyer, true, address(0), false);
        p.quoteToken = address(weth);
        vm.expectRevert(SemvioDealRoom.SemvioBadDeal.selector);
        room.openDeal(p, _terms(GROSS, 0, address(0)));
        vm.stopPrank();
    }

    // ---- who may do what -------------------------------------------------------------------------------------

    function test_strangersAndAgentsCannotApproveSettleOrCancel() public {
        uint256 id = _open();
        (uint32 rev, bytes32 h) = _current(id);
        address[3] memory who = [stranger, sellerAgent, buyerAgent];
        for (uint256 i; i < who.length; i++) {
            vm.startPrank(who[i]);
            _expectBits(M.R_NOT_PARTY);
            room.approve(id, rev, h);
            _expectBits(M.R_NOT_PARTY);
            room.settle(id, rev, h);
            _expectBits(M.R_NOT_PARTY);
            room.cancel(id);
            _expectBits(M.R_NOT_PARTY);
            room.setAgent(id, who[i]);
            _expectBits(M.R_NOT_PARTY);
            room.withdrawApproval(id);
            vm.stopPrank();
        }
        vm.prank(stranger);
        _expectBits(M.R_NOT_PARTY);
        room.proposeRevision(id, rev, _terms(GROSS, 0, address(0)), false);
    }

    function test_agentRemovedSameBlock() public {
        uint256 id = _open();
        vm.prank(seller);
        room.setAgent(id, address(0));
        vm.prank(sellerAgent);
        _expectBits(M.R_NOT_PARTY);
        room.proposeRevision(id, 1, _terms(GROSS, 0, address(0)), false);
    }

    function test_agentCannotBeAParty() public {
        uint256 id = _open();
        vm.prank(seller);
        vm.expectRevert(SemvioDealRoom.SemvioBadDeal.selector);
        room.setAgent(id, buyer);
    }

    function test_withdrawApprovalBlocksSettlement() public {
        uint256 id = _open();
        (uint32 rev, bytes32 h) = _current(id);
        vm.prank(buyer);
        room.approve(id, rev, h);
        vm.prank(seller);
        room.withdrawApproval(id);
        vm.prank(buyer);
        _expectBits(M.R_SELLER_NOT_APPROVED);
        room.settle(id, rev, h);
    }

    function test_cancelClosesForGood() public {
        uint256 id = _open();
        (uint32 rev, bytes32 h) = _current(id);
        vm.prank(buyer);
        room.cancel(id);
        vm.prank(buyer);
        _expectBits(M.R_CLOSED);
        room.approve(id, rev, h);
        vm.prank(seller);
        _expectBits(M.R_CLOSED);
        room.proposeRevision(id, rev, _terms(GROSS, 0, address(0)), false);
        assertTrue(room.checkDeal(id, 0, 0) & M.R_CLOSED != 0);
    }

    function test_cannotSettleTwice() public {
        uint256 id = _open();
        (uint32 rev, bytes32 h) = _current(id);
        vm.prank(buyer);
        room.approveAndSettle(id, rev, h);
        vm.prank(seller);
        _expectBits(M.R_CLOSED);
        room.settle(id, rev, h);
    }

    // ---- time ------------------------------------------------------------------------------------------------

    function test_expiredOfferCannotBeApprovedOrSettled() public {
        uint256 id = _open();
        (uint32 rev, bytes32 h) = _current(id);
        vm.warp(block.timestamp + 1 days + 1);
        vm.prank(buyer);
        _expectBits(M.R_OFFER_EXPIRED);
        room.approveAndSettle(id, rev, h);
        assertTrue(room.checkDeal(id, 0, 0) & M.R_OFFER_EXPIRED != 0);
    }

    function test_expiredDealRefusesEverything() public {
        uint256 id = _open();
        (uint32 rev, bytes32 h) = _current(id);
        vm.warp(block.timestamp + 7 days + 1);
        vm.prank(buyer);
        _expectBits(M.R_DEAL_EXPIRED);
        room.approve(id, rev, h);
        vm.prank(seller);
        _expectBits(M.R_DEAL_EXPIRED | M.R_OFFER_WINDOW);
        room.proposeRevision(id, rev, _terms(GROSS, 0, address(0)), false);
    }

    // ---- checkDeal ---------------------------------------------------------------------------------------------

    function test_checkDealExplainsEverything() public {
        uint256 id = _open();
        uint256 bits = room.checkDeal(id, GROSS - 1, GROSS + 1);
        assertEq(bits, M.R_BUYER_NOT_APPROVED | M.R_OVER_BUDGET | M.R_UNDER_MIN_NET);
        vm.prank(buyer);
        usdg.approve(address(room), 0);
        vm.prank(seller);
        weth.transfer(stranger, 100e18);
        bits = room.checkDeal(id, 0, 0);
        assertEq(bits, M.R_BUYER_NOT_APPROVED | M.R_SELLER_BALANCE | M.R_BUYER_ALLOWANCE);
        assertEq(room.checkDeal(999, 0, 0), M.R_NOT_FOUND);
    }

    function test_checkDealClearOnceReady() public {
        uint256 id = _open();
        (uint32 rev, bytes32 h) = _current(id);
        vm.prank(buyer);
        room.approve(id, rev, h);
        assertEq(room.checkDeal(id, GROSS, GROSS), 0);
    }

    function test_checkTermsAndPreviewHash() public {
        uint256 id = _open();
        M.Terms memory t = _terms(GROSS + 5e6, 50, broker);
        assertEq(room.checkTerms(id, t, GROSS, 0), M.R_OVER_BUDGET);
        bytes32 preview = room.previewRevisionHash(id, buyer, t);
        vm.prank(buyer);
        room.proposeRevision(id, 1, t, false);
        (, bytes32 h) = _current(id);
        assertEq(preview, h);
    }

    // ---- hostile tokens --------------------------------------------------------------------------------------

    function _openWith(address base, address quoteTok) internal returns (uint256 id, uint32 rev, bytes32 h) {
        SemvioDealRoom.OpenParams memory p = _params(buyer, true, address(0), true);
        p.baseToken = base;
        p.quoteToken = quoteTok;
        vm.prank(seller);
        id = room.openDeal(p, _terms(GROSS, 0, address(0)));
        (rev, h) = _current(id);
    }

    function test_noReturnTokenWorks() public {
        SemvioNoReturnToken nr = new SemvioNoReturnToken();
        nr.mint(buyer, 1_000_000e6);
        vm.prank(buyer);
        nr.approve(address(room), type(uint256).max);
        (uint256 id, uint32 rev, bytes32 h) = _openWith(address(weth), address(nr));
        vm.prank(buyer);
        room.approveAndSettle(id, rev, h);
        assertEq(nr.balanceOf(seller), GROSS);
    }

    function test_falseReturningTokenReverts() public {
        SemvioFalseToken ft = new SemvioFalseToken();
        ft.mint(seller, 100e18);
        (uint256 id, uint32 rev, bytes32 h) = _openWith(address(ft), address(usdg));
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(SemvioDealRoom.SemvioTokenCallFailed.selector, address(ft)));
        room.approveAndSettle(id, rev, h);
        (SemvioDealRoom.Deal memory d,) = room.getDeal(id);
        assertEq(uint8(d.status), uint8(SemvioDealRoom.Status.Open)); // rolled back
    }

    function test_feeOnTransferTokenRefused() public {
        SemvioFeeToken fot = new SemvioFeeToken();
        fot.mint(seller, 100e18);
        vm.prank(seller);
        fot.approve(address(room), type(uint256).max);
        (uint256 id, uint32 rev, bytes32 h) = _openWith(address(fot), address(usdg));
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(SemvioDealRoom.SemvioReceivedMismatch.selector, address(fot), uint256(BASE), uint256(BASE) - BASE / 100));
        room.approveAndSettle(id, rev, h);
    }

    function test_lyingTokenRefused() public {
        SemvioLiarToken liar = new SemvioLiarToken();
        liar.mint(seller, 100e18);
        vm.prank(seller);
        liar.approve(address(room), type(uint256).max);
        (uint256 id, uint32 rev, bytes32 h) = _openWith(address(liar), address(usdg));
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(SemvioDealRoom.SemvioReceivedMismatch.selector, address(liar), uint256(BASE), uint256(0)));
        room.approveAndSettle(id, rev, h);
    }

    function test_reentrancyBlocked() public {
        SemvioReentrantToken re = new SemvioReentrantToken();
        re.mint(seller, 100e18);
        vm.prank(seller);
        re.approve(address(room), type(uint256).max);
        (uint256 id, uint32 rev, bytes32 h) = _openWith(address(re), address(usdg));
        re.arm(room, id, rev, h);
        vm.prank(buyer);
        room.approveAndSettle(id, rev, h);
        assertTrue(re.attacked());
        assertEq(bytes4(re.lastError()), SemvioDealRoom.SemvioReentrant.selector);
        assertEq(re.balanceOf(buyer), BASE);
    }

    function test_shortfallRevertsWholeSwap() public {
        uint256 id = _open();
        (uint32 rev, bytes32 h) = _current(id);
        vm.prank(buyer);
        usdg.transfer(stranger, 1_000_000e6 - 1);
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(SemvioDealRoom.SemvioTokenCallFailed.selector, address(usdg)));
        room.approveAndSettle(id, rev, h);
        assertEq(weth.balanceOf(buyer), 0);
        assertEq(weth.balanceOf(seller), 100e18);
    }

    // ---- math ------------------------------------------------------------------------------------------------

    function test_minGrossForNetVectors() public view {
        assertEq(room.minGrossForNet(0, 50), 0);
        assertEq(room.minGrossForNet(1_000_000, 0), 1_000_000);
        // 99.5 % of 1,005,026 = 1,000,000.87 -> fee 5,025 (floor) -> net 1,000,001
        uint256 g = room.minGrossForNet(1_000_000, 50);
        assertGe(g - (g * 50) / 10_000, 1_000_000);
        assertLt((g - 1) - ((g - 1) * 50) / 10_000, 1_000_000);
    }
}

import {SemvioPracticeToken} from "../src/SemvioPracticeToken.sol";

contract SemvioPracticeTokenTest is Test {
    function test_practiceTokenSettlesThroughRoom() public {
        vm.warp(1_800_000_000);
        SemvioDealRoom room = new SemvioDealRoom();
        SemvioPracticeToken a = new SemvioPracticeToken("Semvio Test Asset", "tASSET", 18);
        SemvioPracticeToken q = new SemvioPracticeToken("Semvio Test Dollar", "tUSD", 6);
        address s = address(0x51);
        address b = address(0xB1);
        vm.startPrank(s);
        a.mint(10e18);
        a.approve(address(room), 10e18);
        vm.stopPrank();
        vm.startPrank(b);
        q.mint(50_000e6);
        q.approve(address(room), 50_000e6);
        vm.stopPrank();
        vm.expectRevert(SemvioPracticeToken.SemvioPracticeMintCap.selector);
        q.mint(100_001e6);
        SemvioDealRoom.OpenParams memory p = SemvioDealRoom.OpenParams(b, true, address(a), address(q), 2e18, uint64(block.timestamp + 1 days), bytes32(0), address(0), true);
        vm.prank(s);
        uint256 id = room.openDeal(p, M.Terms(6_000e6, 0, address(0), uint64(block.timestamp + 1 hours), bytes32(0)));
        (SemvioDealRoom.Deal memory d,) = room.getDeal(id);
        vm.prank(b);
        room.approveAndSettle(id, 1, d.lastHash);
        assertEq(a.balanceOf(b), 2e18);
        assertEq(q.balanceOf(s), 6_000e6);
    }
}
