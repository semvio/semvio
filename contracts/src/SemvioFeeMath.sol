// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title SemvioFeeMath
/// @notice Pure math and hashing for SemvioDealRoom, kept apart so the website can mirror it line for line.
///
///         Money in a deal: the buyer pays `gross` quote tokens. An optional agreed fee (at most MAX_FEE_BPS of gross,
///         rounded down) goes to a third-party fee recipient named in the revision. The seller receives
///         `net = gross - fee`. The deal room itself takes nothing.
library SemvioFeeMath {
    uint256 internal constant BPS = 10_000;
    /// @notice Hard cap for the agreed fee: 1 %.
    uint16 internal constant MAX_FEE_BPS = 100;

    // ---- reason bits ---------------------------------------------------------------------------------------
    // One bit per reason a deal cannot move. checkDeal() returns them so a wallet never has to sign a transaction
    // that would revert, and every refusal can be explained before anything is signed. The site keeps the same list.

    uint256 internal constant R_NOT_FOUND = 1 << 0;
    uint256 internal constant R_CLOSED = 1 << 1;
    uint256 internal constant R_DEAL_EXPIRED = 1 << 2;
    uint256 internal constant R_OFFER_EXPIRED = 1 << 3;
    uint256 internal constant R_SELLER_NOT_APPROVED = 1 << 4;
    uint256 internal constant R_BUYER_NOT_APPROVED = 1 << 5;
    uint256 internal constant R_SELLER_BALANCE = 1 << 6;
    uint256 internal constant R_SELLER_ALLOWANCE = 1 << 7;
    uint256 internal constant R_BUYER_BALANCE = 1 << 8;
    uint256 internal constant R_BUYER_ALLOWANCE = 1 << 9;
    uint256 internal constant R_OVER_BUDGET = 1 << 10;
    uint256 internal constant R_UNDER_MIN_NET = 1 << 11;
    uint256 internal constant R_TOKEN_NO_CODE = 1 << 12;
    uint256 internal constant R_FEE_OVER_CAP = 1 << 13;
    uint256 internal constant R_BAD_FEE_RECIPIENT = 1 << 14;
    uint256 internal constant R_ZERO_AMOUNT = 1 << 15;
    uint256 internal constant R_OFFER_WINDOW = 1 << 16;
    uint256 internal constant R_STALE_REVISION = 1 << 17;
    uint256 internal constant R_NOT_PARTY = 1 << 18;
    uint256 internal constant R_REVISION_LIMIT = 1 << 19;

    // ---- types -------------------------------------------------------------------------------------------------

    /// @notice What a revision can change. Assets, amount of the base asset and the two parties are fixed when the deal
    ///         opens; price (gross quote amount), the agreed fee and the offer's own validity move with each revision.
    struct Terms {
        uint128 quoteAmount; // gross, in quote token units, paid by the buyer
        uint16 feeBps; // 0..MAX_FEE_BPS, taken from gross
        address feeRecipient; // zero when feeBps == 0
        uint64 offerValidUntil; // unix seconds; must not exceed the deal's validUntil
        bytes32 noteHash; // keccak256 of the off-chain note that explains the change (optional)
    }

    bytes32 internal constant DEAL_TAG = keccak256("Semvio.Deal.v1");
    bytes32 internal constant REVISION_TAG = keccak256("Semvio.Revision.v1");

    // ---- money -------------------------------------------------------------------------------------------------

    /// @notice Agreed fee for a gross amount, rounded down (the seller never pays more than feeBps).
    function feeOf(uint256 gross, uint16 feeBps) internal pure returns (uint256) {
        return (gross * feeBps) / BPS;
    }

    /// @notice What the seller receives.
    function netOf(uint256 gross, uint16 feeBps) internal pure returns (uint256) {
        return gross - feeOf(gross, feeBps);
    }

    /// @notice Smallest gross whose net is at least `net`. Requires feeBps < BPS.
    function minGrossForNet(uint256 net, uint16 feeBps) internal pure returns (uint256 gross) {
        if (net == 0) return 0;
        // ceil(net * BPS / (BPS - feeBps)), then step down while the next lower gross still clears the floor.
        gross = (net * BPS + (BPS - feeBps) - 1) / (BPS - feeBps);
        while (gross > 0 && netOf(gross - 1, feeBps) >= net) gross--;
    }

    // ---- terms -------------------------------------------------------------------------------------------------

    /// @notice Reasons a revision's terms are refused on their own, at `nowTs`, for a deal valid until `dealValidUntil`.
    function termsBits(Terms memory t, address seller, address buyer, uint64 dealValidUntil, uint256 nowTs) internal pure returns (uint256 bits) {
        if (t.quoteAmount == 0) bits |= R_ZERO_AMOUNT;
        if (t.feeBps > MAX_FEE_BPS) bits |= R_FEE_OVER_CAP;
        if (t.feeBps == 0) {
            if (t.feeRecipient != address(0)) bits |= R_BAD_FEE_RECIPIENT;
        } else if (t.feeRecipient == address(0) || t.feeRecipient == seller || t.feeRecipient == buyer) {
            bits |= R_BAD_FEE_RECIPIENT;
        }
        if (t.offerValidUntil <= nowTs || t.offerValidUntil > dealValidUntil) bits |= R_OFFER_WINDOW;
    }

    /// @notice Limit check of a revision against the buyer's budget (max gross) and the seller's minimum net.
    ///         A zero limit means "not given".
    function limitBits(uint256 gross, uint16 feeBps, uint256 buyerMaxGross, uint256 sellerMinNet) internal pure returns (uint256 bits) {
        if (buyerMaxGross != 0 && gross > buyerMaxGross) bits |= R_OVER_BUDGET;
        if (sellerMinNet != 0 && netOf(gross, feeBps) < sellerMinNet) bits |= R_UNDER_MIN_NET;
    }

    // ---- hashes ------------------------------------------------------------------------------------------------

    /// @notice Fingerprint of the fixed part of a deal. Revision 1 chains from it.
    function dealHash(
        uint256 chainId,
        address room,
        uint256 id,
        address seller,
        address buyer,
        address baseToken,
        address quoteToken,
        uint256 baseAmount,
        uint64 validUntil,
        bytes32 ref
    ) internal pure returns (bytes32) {
        return keccak256(abi.encode(DEAL_TAG, chainId, room, id, seller, buyer, baseToken, quoteToken, baseAmount, validUntil, ref));
    }

    /// @notice Fingerprint of one revision, chained to the previous one. Approving a revision means approving this hash.
    function revisionHash(bytes32 prevHash, uint256 id, uint32 revision, address proposer, bool sellerSide, Terms memory t)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(
            abi.encode(
                REVISION_TAG, prevHash, id, revision, proposer, sellerSide, t.quoteAmount, t.feeBps, t.feeRecipient, t.offerValidUntil, t.noteHash
            )
        );
    }
}
