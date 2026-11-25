// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title SemvioPracticeToken
/// @notice A test token for trying deals on Robinhood Chain Testnet. Anyone may mint up to 100,000 units per call.
///         It has no value and is never deployed to mainnet by the site (the deploy page offers it on the testnet only).
contract SemvioPracticeToken {
    string public name;
    string public symbol;
    uint8 public immutable decimals;
    uint256 public totalSupply;
    uint256 public immutable mintCap;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    error SemvioPracticeMintCap();
    error SemvioPracticeBalance();
    error SemvioPracticeAllowance();

    constructor(string memory n, string memory s, uint8 d) {
        name = n;
        symbol = s;
        decimals = d;
        mintCap = 100_000 * 10 ** uint256(d);
    }

    /// @notice Test faucet: mints `amount` to the caller.
    function mint(uint256 amount) external {
        if (amount > mintCap) revert SemvioPracticeMintCap();
        totalSupply += amount;
        balanceOf[msg.sender] += amount;
        emit Transfer(address(0), msg.sender, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _move(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 a = allowance[from][msg.sender];
        if (a < amount) revert SemvioPracticeAllowance();
        if (a != type(uint256).max) allowance[from][msg.sender] = a - amount;
        _move(from, to, amount);
        return true;
    }

    function _move(address from, address to, uint256 amount) internal {
        if (balanceOf[from] < amount) revert SemvioPracticeBalance();
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}
