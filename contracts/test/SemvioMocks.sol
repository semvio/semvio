// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {SemvioDealRoom} from "../src/SemvioDealRoom.sol";

/// @notice Plain ERC-20 for tests.
contract SemvioTestToken {
    string public name;
    string public symbol;
    uint8 public immutable decimals;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(string memory n, string memory s, uint8 d) {
        name = n;
        symbol = s;
        decimals = d;
    }

    function mint(address to, uint256 v) external {
        balanceOf[to] += v;
        totalSupply += v;
    }

    function approve(address s, uint256 v) public virtual returns (bool) {
        allowance[msg.sender][s] = v;
        return true;
    }

    function transfer(address to, uint256 v) public virtual returns (bool) {
        _move(msg.sender, to, v);
        return true;
    }

    function transferFrom(address f, address to, uint256 v) public virtual returns (bool) {
        _spend(f, v);
        _move(f, to, v);
        return true;
    }

    function _spend(address f, uint256 v) internal {
        uint256 a = allowance[f][msg.sender];
        require(a >= v, "allowance");
        if (a != type(uint256).max) allowance[f][msg.sender] = a - v;
    }

    function _move(address f, address to, uint256 v) internal virtual {
        require(balanceOf[f] >= v, "balance");
        balanceOf[f] -= v;
        balanceOf[to] += v;
    }
}

/// @notice USDT-style: no return values.
contract SemvioNoReturnToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 v) external {
        balanceOf[to] += v;
    }

    function approve(address s, uint256 v) external {
        allowance[msg.sender][s] = v;
    }

    function transferFrom(address f, address to, uint256 v) external {
        require(allowance[f][msg.sender] >= v && balanceOf[f] >= v, "nope");
        allowance[f][msg.sender] -= v;
        balanceOf[f] -= v;
        balanceOf[to] += v;
    }
}

/// @notice Returns false instead of reverting, and moves nothing.
contract SemvioFalseToken is SemvioTestToken("False", "FALSE", 18) {
    function transferFrom(address, address, uint256) public pure override returns (bool) {
        return false;
    }
}

/// @notice Takes 1 % on every move.
contract SemvioFeeToken is SemvioTestToken("Fee", "FEE", 18) {
    function _move(address f, address to, uint256 v) internal override {
        require(balanceOf[f] >= v, "balance");
        uint256 fee = v / 100;
        balanceOf[f] -= v;
        balanceOf[to] += v - fee;
        balanceOf[address(0xdead)] += fee;
    }
}

/// @notice Says it moved but credits nobody (a lying token).
contract SemvioLiarToken is SemvioTestToken("Liar", "LIAR", 18) {
    function transferFrom(address f, address, uint256 v) public override returns (bool) {
        _spend(f, v);
        balanceOf[f] -= v;
        return true;
    }
}

/// @notice Calls back into the room during transferFrom.
contract SemvioReentrantToken is SemvioTestToken("Re", "RE", 18) {
    SemvioDealRoom public room;
    uint256 public id;
    uint32 public rev;
    bytes32 public hash;
    bool public attacked;
    bytes public lastError;

    function arm(SemvioDealRoom r, uint256 i, uint32 rv, bytes32 h) external {
        room = r;
        id = i;
        rev = rv;
        hash = h;
    }

    function transferFrom(address f, address t, uint256 v) public override returns (bool) {
        if (address(room) != address(0) && !attacked) {
            attacked = true;
            try room.settle(id, rev, hash) {} catch (bytes memory e) {
                lastError = e;
            }
        }
        return super.transferFrom(f, t, v);
    }
}
