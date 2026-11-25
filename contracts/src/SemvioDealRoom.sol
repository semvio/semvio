// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {SemvioFeeMath as M} from "./SemvioFeeMath.sol";

/// @notice Minimal ERC-20 surface the room reads.
interface ISemvioERC20 {
    function balanceOf(address) external view returns (uint256);
    function allowance(address, address) external view returns (uint256);
}

/// @title SemvioDealRoom
/// @notice Over-the-counter deals between two named wallets on Robinhood Chain, settled as one atomic swap.
///
///         A deal fixes the two parties (seller and buyer), the base asset and its amount, the quote asset and a
///         validity window. The price lives in revisions: either party, or an agent address a party appointed, proposes
///         new terms (gross quote amount, an optional agreed fee of at most 1 % to a named third party, the offer's own
///         expiry and a note hash). Every revision is chained to the previous one by hash and stored on chain, so the
///         whole negotiation history can be checked against the contract.
///
///         Approval is per revision: each party approves one exact revision hash. A new revision makes older approvals
///         worthless; a party can withdraw an approval at any time before settlement. Settlement only happens for the
///         current revision when both parties approved that same revision and neither the offer nor the deal expired.
///
///         Non-custodial: the room never holds a balance. Settlement moves the base asset seller -> buyer and the quote
///         asset buyer -> seller (net) and buyer -> fee recipient (fee), all with `transferFrom` under the parties' own
///         allowances, in one transaction. Any shortfall reverts the whole swap.
///
///         Agents only propose. They can never approve, settle, cancel or appoint anyone. A party removes its agent
///         with one call, effective for the next transaction in the same block.
///
///         No admin, no protocol fee, no upgrade, no pause over other people's deals.
///         Not supported in v1: native ETH (use WETH), fee-on-transfer tokens (refused: what arrives must equal what was
///         sent), rebasing tokens whose balance moves inside a transfer.
contract SemvioDealRoom {
    // ---- types -----------------------------------------------------------------------------------------------

    enum Status {
        None,
        Open,
        Settled,
        Cancelled
    }

    struct Deal {
        address seller;
        address buyer;
        address maker; // the party who opened the deal
        address baseToken;
        address quoteToken;
        uint128 baseAmount;
        uint64 openedAt;
        uint64 validUntil;
        uint32 revision; // current revision number, starts at 1
        uint32 sellerApproved; // revision number the seller approved, 0 = none
        uint32 buyerApproved; // revision number the buyer approved, 0 = none
        Status status;
        address sellerAgent;
        address buyerAgent;
        bytes32 ref; // hash of the off-chain request this deal came from (optional)
        bytes32 lastHash; // hash of the current revision
    }

    struct OpenParams {
        address counterparty;
        bool makerIsSeller;
        address baseToken;
        address quoteToken;
        uint128 baseAmount;
        uint64 validUntil;
        bytes32 ref;
        address makerAgent; // optional agent for the maker's side
        bool approve; // maker approves revision 1 right away
    }

    // ---- constants -------------------------------------------------------------------------------------------

    /// @notice Longest validity window a deal may have.
    uint64 public constant MAX_WINDOW = 30 days;
    /// @notice Most revisions one deal may collect.
    uint32 public constant MAX_REVISIONS = 64;
    uint16 public constant MAX_FEE_BPS = M.MAX_FEE_BPS;

    // ---- storage ---------------------------------------------------------------------------------------------

    uint256 public dealCount;
    mapping(uint256 => Deal) internal _deals;
    mapping(uint256 => M.Terms) internal _terms; // terms of the current revision
    mapping(uint256 => mapping(uint32 => bytes32)) public revisionHashOf;
    mapping(uint256 => bytes32) public dealHashOf;
    mapping(address => uint256[]) internal _dealsOf;
    uint256 private _lock = 1;

    // ---- events ----------------------------------------------------------------------------------------------

    event DealOpened(
        uint256 indexed id,
        address indexed seller,
        address indexed buyer,
        address maker,
        address baseToken,
        address quoteToken,
        uint256 baseAmount,
        uint64 validUntil,
        bytes32 ref,
        bytes32 dealHash
    );
    event RevisionProposed(
        uint256 indexed id, uint32 indexed revision, address indexed proposer, bool sellerSide, bytes32 hash, bytes32 prevHash, M.Terms terms
    );
    event Approved(uint256 indexed id, uint32 indexed revision, address indexed party, bytes32 hash);
    event ApprovalWithdrawn(uint256 indexed id, uint32 indexed revision, address indexed party);
    event AgentSet(uint256 indexed id, address indexed party, address indexed agent);
    event Settled(
        uint256 indexed id,
        uint32 indexed revision,
        bytes32 indexed hash,
        address seller,
        address buyer,
        address baseToken,
        uint256 baseAmount,
        address quoteToken,
        uint256 gross,
        uint256 fee,
        address feeRecipient,
        uint256 net
    );
    event Cancelled(uint256 indexed id, address indexed by);

    // ---- errors ----------------------------------------------------------------------------------------------

    /// @notice A call was refused; `bits` uses the SemvioFeeMath reason bits.
    error SemvioRefused(uint256 bits);
    error SemvioBadDeal();
    error SemvioReentrant();
    error SemvioTokenCallFailed(address token);
    error SemvioReceivedMismatch(address token, uint256 expected, uint256 received);

    // ---- modifiers -------------------------------------------------------------------------------------------

    modifier nonReentrant() {
        if (_lock != 1) revert SemvioReentrant();
        _lock = 2;
        _;
        _lock = 1;
    }

    // ---- open ------------------------------------------------------------------------------------------------

    /// @notice Opens a deal with a named counterparty and its first revision (proposed by the caller).
    function openDeal(OpenParams calldata p, M.Terms calldata first) external nonReentrant returns (uint256 id) {
        _validateOpen(p, first);
        id = ++dealCount;
        Deal storage d = _deals[id];
        _store(d, p);
        bytes32 dh = _hashDeal(id, d);
        dealHashOf[id] = dh;
        d.lastHash = dh;
        _dealsOf[d.seller].push(id);
        _dealsOf[d.buyer].push(id);
        emit DealOpened(id, d.seller, d.buyer, msg.sender, d.baseToken, d.quoteToken, d.baseAmount, d.validUntil, d.ref, dh);

        if (p.makerAgent != address(0)) {
            if (p.makerIsSeller) d.sellerAgent = p.makerAgent;
            else d.buyerAgent = p.makerAgent;
            emit AgentSet(id, msg.sender, p.makerAgent);
        }
        _record(d, id, first, msg.sender, p.makerIsSeller);
        if (p.approve) _approve(d, id, p.makerIsSeller);
    }

    function _validateOpen(OpenParams calldata p, M.Terms calldata first) internal view {
        if (
            p.counterparty == address(0) || p.counterparty == msg.sender || p.baseToken == p.quoteToken || p.baseToken == address(0)
                || p.quoteToken == address(0) || p.validUntil <= block.timestamp || p.validUntil > block.timestamp + MAX_WINDOW
                || p.makerAgent == p.counterparty || p.makerAgent == msg.sender
        ) revert SemvioBadDeal();
        uint256 bits;
        if (p.baseAmount == 0) bits |= M.R_ZERO_AMOUNT;
        if (p.baseToken.code.length == 0 || p.quoteToken.code.length == 0) bits |= M.R_TOKEN_NO_CODE;
        address seller = p.makerIsSeller ? msg.sender : p.counterparty;
        address buyer = p.makerIsSeller ? p.counterparty : msg.sender;
        bits |= M.termsBits(first, seller, buyer, p.validUntil, block.timestamp);
        if (bits != 0) revert SemvioRefused(bits);
    }

    function _store(Deal storage d, OpenParams calldata p) internal {
        d.seller = p.makerIsSeller ? msg.sender : p.counterparty;
        d.buyer = p.makerIsSeller ? p.counterparty : msg.sender;
        d.maker = msg.sender;
        d.baseToken = p.baseToken;
        d.quoteToken = p.quoteToken;
        d.baseAmount = p.baseAmount;
        d.openedAt = uint64(block.timestamp);
        d.validUntil = p.validUntil;
        d.status = Status.Open;
        d.ref = p.ref;
    }

    function _hashDeal(uint256 id, Deal storage d) internal view returns (bytes32) {
        return M.dealHash(block.chainid, address(this), id, d.seller, d.buyer, d.baseToken, d.quoteToken, d.baseAmount, d.validUntil, d.ref);
    }

    // ---- revisions -------------------------------------------------------------------------------------------

    /// @notice Proposes new terms. `expectedRevision` must be the current revision number (guards against racing a
    ///         counter-proposal). A party may approve its own proposal in the same call; an agent never approves.
    function proposeRevision(uint256 id, uint32 expectedRevision, M.Terms calldata t, bool alsoApprove) external nonReentrant returns (uint32 revision) {
        Deal storage d = _deals[id];
        (bool sellerSide, bool principal) = _side(d, msg.sender);
        uint256 bits = _liveBits(d);
        if (d.status == Status.None) revert SemvioRefused(M.R_NOT_FOUND);
        if (expectedRevision != d.revision) bits |= M.R_STALE_REVISION;
        if (d.revision >= MAX_REVISIONS) bits |= M.R_REVISION_LIMIT;
        bits |= M.termsBits(t, d.seller, d.buyer, d.validUntil, block.timestamp);
        if (bits != 0) revert SemvioRefused(bits);
        revision = _record(d, id, t, msg.sender, sellerSide);
        if (alsoApprove) {
            if (!principal) revert SemvioRefused(M.R_NOT_PARTY);
            _approve(d, id, sellerSide);
        }
    }

    /// @notice Approves exactly revision `revision` with hash `hash`. Only the seller or the buyer, never an agent.
    function approve(uint256 id, uint32 revision, bytes32 hash) external nonReentrant {
        Deal storage d = _deals[id];
        bool sellerSide = _principal(d, msg.sender);
        _checkCurrent(d, revision, hash);
        _approve(d, id, sellerSide);
    }

    /// @notice Approves and, when the other party already approved the same revision, settles in the same transaction.
    function approveAndSettle(uint256 id, uint32 revision, bytes32 hash) external nonReentrant {
        Deal storage d = _deals[id];
        bool sellerSide = _principal(d, msg.sender);
        _checkCurrent(d, revision, hash);
        _approve(d, id, sellerSide);
        _settle(d, id);
    }

    /// @notice Withdraws the caller's approval. Takes effect for the next transaction.
    function withdrawApproval(uint256 id) external nonReentrant {
        Deal storage d = _deals[id];
        bool sellerSide = _principal(d, msg.sender);
        if (d.status != Status.Open) revert SemvioRefused(M.R_CLOSED);
        uint32 had = sellerSide ? d.sellerApproved : d.buyerApproved;
        if (sellerSide) d.sellerApproved = 0;
        else d.buyerApproved = 0;
        emit ApprovalWithdrawn(id, had, msg.sender);
    }

    /// @notice Settles the current revision when both parties approved it. Either party may call.
    function settle(uint256 id, uint32 revision, bytes32 hash) external nonReentrant {
        Deal storage d = _deals[id];
        _principal(d, msg.sender);
        _checkCurrent(d, revision, hash);
        _settle(d, id);
    }

    /// @notice Either party closes an open deal. Nothing moves.
    function cancel(uint256 id) external nonReentrant {
        Deal storage d = _deals[id];
        _principal(d, msg.sender);
        if (d.status != Status.Open) revert SemvioRefused(M.R_CLOSED);
        d.status = Status.Cancelled;
        d.sellerApproved = 0;
        d.buyerApproved = 0;
        emit Cancelled(id, msg.sender);
    }

    /// @notice Appoints (or with zero, removes) the agent that may propose revisions for the caller's side.
    function setAgent(uint256 id, address agent) external nonReentrant {
        Deal storage d = _deals[id];
        bool sellerSide = _principal(d, msg.sender);
        if (d.status != Status.Open) revert SemvioRefused(M.R_CLOSED);
        if (agent == d.seller || agent == d.buyer) revert SemvioBadDeal();
        if (sellerSide) d.sellerAgent = agent;
        else d.buyerAgent = agent;
        emit AgentSet(id, msg.sender, agent);
    }

    // ---- views -----------------------------------------------------------------------------------------------

    function getDeal(uint256 id) external view returns (Deal memory deal, M.Terms memory terms) {
        return (_deals[id], _terms[id]);
    }

    function dealsOf(address who) external view returns (uint256[] memory) {
        return _dealsOf[who];
    }

    function dealsOfCount(address who) external view returns (uint256) {
        return _dealsOf[who].length;
    }

    /// @notice A page of `who`'s deal ids, newest first: `limit` ids skipping the `offset` newest. Anyone can open a deal naming
    ///         any address as counterparty, so lists can be long; read them in pages.
    function dealsOfPage(address who, uint256 offset, uint256 limit) external view returns (uint256[] memory ids) {
        uint256[] storage all = _dealsOf[who];
        uint256 n = all.length;
        if (offset >= n) return new uint256[](0);
        uint256 k = n - offset < limit ? n - offset : limit;
        ids = new uint256[](k);
        for (uint256 i; i < k; i++) ids[i] = all[n - 1 - offset - i];
    }

    /// @notice Fee and net of the current revision.
    function quote(uint256 id) external view returns (uint256 gross, uint256 fee, uint256 net) {
        M.Terms storage t = _terms[id];
        gross = t.quoteAmount;
        fee = M.feeOf(gross, t.feeBps);
        net = gross - fee;
    }

    /// @notice Smallest gross that leaves the seller `net` after `feeBps`.
    function minGrossForNet(uint256 net, uint16 feeBps) external pure returns (uint256) {
        if (feeBps > M.MAX_FEE_BPS) revert SemvioRefused(M.R_FEE_OVER_CAP);
        return M.minGrossForNet(net, feeBps);
    }

    /// @notice Every reason the current revision of deal `id` cannot settle now, plus an optional check against the
    ///         buyer's budget and the seller's minimum net (zero = not given). A read: limits passed here are never
    ///         written to the chain.
    function checkDeal(uint256 id, uint256 buyerMaxGross, uint256 sellerMinNet) external view returns (uint256 bits) {
        Deal storage d = _deals[id];
        if (d.status == Status.None) return M.R_NOT_FOUND;
        bits = _liveBits(d);
        M.Terms storage t = _terms[id];
        if (t.offerValidUntil < block.timestamp) bits |= M.R_OFFER_EXPIRED;
        if (d.sellerApproved != d.revision) bits |= M.R_SELLER_NOT_APPROVED;
        if (d.buyerApproved != d.revision) bits |= M.R_BUYER_NOT_APPROVED;
        bits |= M.limitBits(t.quoteAmount, t.feeBps, buyerMaxGross, sellerMinNet);
        if (d.baseToken.code.length == 0 || d.quoteToken.code.length == 0) return bits | M.R_TOKEN_NO_CODE;
        (bool okB, uint256 sb) = _read(d.baseToken, abi.encodeCall(ISemvioERC20.balanceOf, (d.seller)));
        (bool okA, uint256 sa) = _read(d.baseToken, abi.encodeCall(ISemvioERC20.allowance, (d.seller, address(this))));
        (bool okQ, uint256 bb) = _read(d.quoteToken, abi.encodeCall(ISemvioERC20.balanceOf, (d.buyer)));
        (bool okQA, uint256 ba) = _read(d.quoteToken, abi.encodeCall(ISemvioERC20.allowance, (d.buyer, address(this))));
        if (!okB || sb < d.baseAmount) bits |= M.R_SELLER_BALANCE;
        if (!okA || sa < d.baseAmount) bits |= M.R_SELLER_ALLOWANCE;
        if (!okQ || bb < t.quoteAmount) bits |= M.R_BUYER_BALANCE;
        if (!okQA || ba < t.quoteAmount) bits |= M.R_BUYER_ALLOWANCE;
    }

    /// @notice Reasons proposed terms would be refused for deal `id` right now (a party's or agent's pre-check).
    function checkTerms(uint256 id, M.Terms calldata t, uint256 buyerMaxGross, uint256 sellerMinNet) external view returns (uint256 bits) {
        Deal storage d = _deals[id];
        if (d.status == Status.None) return M.R_NOT_FOUND;
        bits = _liveBits(d) | M.termsBits(t, d.seller, d.buyer, d.validUntil, block.timestamp);
        if (d.revision >= MAX_REVISIONS) bits |= M.R_REVISION_LIMIT;
        bits |= M.limitBits(t.quoteAmount, t.feeBps, buyerMaxGross, sellerMinNet);
    }

    /// @notice The hash a revision with these terms would get if `proposer` proposed it next.
    function previewRevisionHash(uint256 id, address proposer, M.Terms calldata t) external view returns (bytes32) {
        Deal storage d = _deals[id];
        if (d.status == Status.None) revert SemvioRefused(M.R_NOT_FOUND);
        (bool sellerSide,) = _side(d, proposer);
        return M.revisionHash(d.lastHash, id, d.revision + 1, proposer, sellerSide, t);
    }

    // ---- internals -------------------------------------------------------------------------------------------

    function _liveBits(Deal storage d) internal view returns (uint256 bits) {
        if (d.status != Status.Open) bits |= M.R_CLOSED;
        if (d.validUntil < block.timestamp) bits |= M.R_DEAL_EXPIRED;
    }

    /// @dev Which side `who` speaks for. Reverts when `who` is neither a party nor a party's agent.
    function _side(Deal storage d, address who) internal view returns (bool sellerSide, bool principal) {
        if (d.status == Status.None) revert SemvioRefused(M.R_NOT_FOUND);
        if (who == d.seller) return (true, true);
        if (who == d.buyer) return (false, true);
        if (who != address(0) && who == d.sellerAgent) return (true, false);
        if (who != address(0) && who == d.buyerAgent) return (false, false);
        revert SemvioRefused(M.R_NOT_PARTY);
    }

    /// @dev Only the two parties themselves.
    function _principal(Deal storage d, address who) internal view returns (bool sellerSide) {
        if (d.status == Status.None) revert SemvioRefused(M.R_NOT_FOUND);
        if (who == d.seller) return true;
        if (who == d.buyer) return false;
        revert SemvioRefused(M.R_NOT_PARTY);
    }

    function _checkCurrent(Deal storage d, uint32 revision, bytes32 hash) internal view {
        uint256 bits = _liveBits(d);
        if (revision != d.revision || hash != d.lastHash) bits |= M.R_STALE_REVISION;
        if (bits != 0) revert SemvioRefused(bits);
    }

    function _record(Deal storage d, uint256 id, M.Terms memory t, address proposer, bool sellerSide) internal returns (uint32 revision) {
        revision = d.revision + 1;
        bytes32 prev = d.lastHash;
        bytes32 h = M.revisionHash(prev, id, revision, proposer, sellerSide, t);
        d.revision = revision;
        d.lastHash = h;
        _terms[id] = t;
        revisionHashOf[id][revision] = h;
        emit RevisionProposed(id, revision, proposer, sellerSide, h, prev, t);
    }

    function _approve(Deal storage d, uint256 id, bool sellerSide) internal {
        M.Terms storage t = _terms[id];
        if (t.offerValidUntil < block.timestamp) revert SemvioRefused(M.R_OFFER_EXPIRED);
        if (sellerSide) d.sellerApproved = d.revision;
        else d.buyerApproved = d.revision;
        emit Approved(id, d.revision, sellerSide ? d.seller : d.buyer, d.lastHash);
    }

    function _settle(Deal storage d, uint256 id) internal {
        M.Terms memory t = _terms[id];
        uint256 bits;
        if (t.offerValidUntil < block.timestamp) bits |= M.R_OFFER_EXPIRED;
        if (d.sellerApproved != d.revision) bits |= M.R_SELLER_NOT_APPROVED;
        if (d.buyerApproved != d.revision) bits |= M.R_BUYER_NOT_APPROVED;
        if (bits != 0) revert SemvioRefused(bits);

        // Effects before any token call.
        d.status = Status.Settled;
        address seller = d.seller;
        address buyer = d.buyer;
        uint256 gross = t.quoteAmount;
        uint256 fee = M.feeOf(gross, t.feeBps);
        uint256 net = gross - fee;

        _pull(d.baseToken, seller, buyer, d.baseAmount);
        _pull(d.quoteToken, buyer, seller, net);
        if (fee != 0) _pull(d.quoteToken, buyer, t.feeRecipient, fee);

        _emitSettled(id, d, gross, fee, t.feeRecipient, net);
    }

    function _emitSettled(uint256 id, Deal storage d, uint256 gross, uint256 fee, address feeRecipient, uint256 net) internal {
        emit Settled(id, d.revision, d.lastHash, d.seller, d.buyer, d.baseToken, d.baseAmount, d.quoteToken, gross, fee, feeRecipient, net);
    }

    /// @dev transferFrom with no-return support, and an exact-arrival check (fee-on-transfer tokens are refused).
    function _pull(address token, address from, address to, uint256 amount) internal {
        if (amount == 0) return;
        uint256 before = _balance(token, to);
        (bool ok, bytes memory ret) = token.call(abi.encodeWithSelector(0x23b872dd, from, to, amount));
        if (!ok || (ret.length != 0 && (ret.length < 32 || abi.decode(ret, (uint256)) != 1))) revert SemvioTokenCallFailed(token);
        uint256 afterBal = _balance(token, to);
        uint256 got = afterBal > before ? afterBal - before : 0;
        if (got != amount) revert SemvioReceivedMismatch(token, amount, got);
    }

    function _balance(address token, address who) internal view returns (uint256 v) {
        (bool ok, uint256 b) = _read(token, abi.encodeCall(ISemvioERC20.balanceOf, (who)));
        if (!ok) revert SemvioTokenCallFailed(token);
        return b;
    }

    function _read(address token, bytes memory data) internal view returns (bool ok, uint256 v) {
        bytes memory ret;
        (ok, ret) = token.staticcall(data);
        if (!ok || ret.length < 32) return (false, 0);
        v = abi.decode(ret, (uint256));
    }
}
