// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {SemvioFeeMath as M} from "../src/SemvioFeeMath.sol";

/// @notice Fixed vectors the website's math.test.ts must reproduce (deal hash, revision hash, fee rounding).
contract SemvioHashVectorsTest is Test {
    function test_vectors() public pure {
        bytes32 dh = M.dealHash(4663, address(0x1234), 7, address(0xA11CE), address(0xB0B), address(0xBA5E), address(0x0D0D), 5e18, 1_800_000_000, keccak256("ref"));
        M.Terms memory t = M.Terms(15_000e6, 25, address(0xFEE), 1_800_003_600, keccak256("note"));
        bytes32 rh = M.revisionHash(dh, 7, 3, address(0xA11CE), true, t);
        assertEq(dh, 0x6ad95b10a49e1e544d2e70be65e9ceab1e2faf4f5ef73e3ccf1885167bd746f7);
        assertEq(rh, 0x8c60ba00e67cd5354cf41b0f88e09d6c8222d8f70f7b133c0e36ba4d78721bbe);
    }
}
