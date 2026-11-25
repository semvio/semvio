// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {SemvioDealRoom} from "../src/SemvioDealRoom.sol";
import {SemvioFeeMath as M} from "../src/SemvioFeeMath.sol";

interface IForkERC20 {
    function balanceOf(address) external view returns (uint256);
    function approve(address, uint256) external returns (bool);
    function decimals() external view returns (uint8);
    function symbol() external view returns (string memory);
}

interface IForkWETH is IForkERC20 {
    function deposit() external payable;
}

interface IForkRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}

/// @notice Runs against a fork of Robinhood Chain mainnet (chain 4663) with the real WETH and USDG:
///         forge test --match-contract Fork --fork-url <rpc> --evm-version cancun
///         The buyer gets real USDG by swapping WETH on the chain's Uniswap v3 SwapRouter02.
contract SemvioForkTest is Test {
    address constant WETH = 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73;
    address constant USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;
    address constant ROUTER = 0xCaf681a66D020601342297493863E78C959E5cb2;

    SemvioDealRoom room;
    address seller = address(0x5E11E5);
    address buyer = address(0xB0BB0B);
    address broker = address(0xFEEFEE);

    function setUp() public {
        if (block.chainid != 4663) return;
        room = new SemvioDealRoom();
        vm.deal(seller, 10 ether);
        vm.deal(buyer, 10 ether);
        vm.prank(seller);
        IForkWETH(WETH).deposit{value: 3 ether}();
        vm.startPrank(buyer);
        IForkWETH(WETH).deposit{value: 3 ether}();
        IForkERC20(WETH).approve(ROUTER, 3 ether);
        IForkRouter(ROUTER).exactInputSingle(
            IForkRouter.ExactInputSingleParams(WETH, USDG, 100, buyer, 3 ether, 1, 0)
        );
        vm.stopPrank();
    }

    function test_realTokensFacts() public view {
        if (block.chainid != 4663) return;
        assertEq(IForkERC20(USDG).decimals(), 6);
        assertEq(keccak256(bytes(IForkERC20(USDG).symbol())), keccak256("USDG"));
        assertEq(IForkERC20(WETH).decimals(), 18);
        assertGt(IForkERC20(USDG).balanceOf(buyer), 1_000e6);
    }

    function test_forkWethForUsdgSettles() public {
        if (block.chainid != 4663) return;
        uint256 usdgHave = IForkERC20(USDG).balanceOf(buyer);
        uint128 gross = uint128(usdgHave / 2);
        vm.prank(seller);
        IForkERC20(WETH).approve(address(room), 1 ether);
        vm.prank(buyer);
        IForkERC20(USDG).approve(address(room), gross);

        SemvioDealRoom.OpenParams memory p = SemvioDealRoom.OpenParams({
            counterparty: buyer,
            makerIsSeller: true,
            baseToken: WETH,
            quoteToken: USDG,
            baseAmount: 1 ether,
            validUntil: uint64(block.timestamp + 2 days),
            ref: keccak256("fork"),
            makerAgent: address(0),
            approve: true
        });
        M.Terms memory t = M.Terms(gross + 1_000e6, 0, address(0), uint64(block.timestamp + 1 days), bytes32(0));
        vm.prank(seller);
        uint256 gasStart = gasleft();
        uint256 id = room.openDeal(p, t);
        emit log_named_uint("openDeal gas (approx)", gasStart - gasleft());

        // Buyer counters lower, with a 10 bps broker fee, and approves its own revision.
        M.Terms memory t2 = M.Terms(gross, 10, broker, uint64(block.timestamp + 1 days), keccak256("counter"));
        assertEq(room.checkTerms(id, t2, gross, 0), 0);
        vm.prank(buyer);
        room.proposeRevision(id, 1, t2, true);
        (SemvioDealRoom.Deal memory d,) = room.getDeal(id);
        assertEq(room.checkDeal(id, gross, 0), M.R_SELLER_NOT_APPROVED);

        uint256 s0 = IForkERC20(USDG).balanceOf(seller);
        vm.prank(seller);
        gasStart = gasleft();
        room.approveAndSettle(id, d.revision, d.lastHash);
        emit log_named_uint("approveAndSettle gas (approx)", gasStart - gasleft());
        uint256 fee = (uint256(gross) * 10) / 10_000;
        assertEq(IForkERC20(USDG).balanceOf(seller) - s0, gross - fee);
        assertEq(IForkERC20(USDG).balanceOf(broker), fee);
        assertEq(IForkERC20(WETH).balanceOf(buyer), 1 ether);
        assertEq(IForkERC20(USDG).balanceOf(address(room)), 0);
        assertEq(IForkERC20(WETH).balanceOf(address(room)), 0);
    }

    function test_forkShortAllowanceShowsInCheck() public {
        if (block.chainid != 4663) return;
        SemvioDealRoom.OpenParams memory p = SemvioDealRoom.OpenParams(buyer, true, WETH, USDG, 1 ether, uint64(block.timestamp + 1 days), bytes32(0), address(0), true);
        vm.prank(seller);
        uint256 id = room.openDeal(p, M.Terms(1_000e6, 0, address(0), uint64(block.timestamp + 1 hours), bytes32(0)));
        assertEq(room.checkDeal(id, 0, 0), M.R_BUYER_NOT_APPROVED | M.R_SELLER_ALLOWANCE | M.R_BUYER_ALLOWANCE);
    }
}
