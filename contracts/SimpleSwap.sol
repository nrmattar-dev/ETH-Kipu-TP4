// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

using SafeERC20 for IERC20;

/// @title SimpleSwap
/// @author Nahuel Ruiz Mattar
/// @notice A basic token swap contract that allows adding/removing liquidity and swapping between two tokens
/// @dev This contract issues its own ERC20 token as liquidity representation
contract SimpleSwap is ERC20 {

    /// @dev Used to scale prices to 18 decimals (standard for ERC20)
    uint constant DECIMALS_FACTOR = 10**18;

    /// @dev Minimum liquidity locked in the pool to avoid divide-by-zero scenarios. As SwapVerifier do not contemplate this, it will be zero.
    uint constant MINIMUM_LIQUIDITY = 0;

    /// @dev Used for nonReentrancy modifier
    bool private locked;

    /// @dev Structure containing all necessary data for token pair operations
    struct TokenPairData {
        address tokenA;
        address tokenB;
        uint reserveA;
        uint reserveB;
        uint amountA;
        uint amountB;
        uint amountADesired;
        uint amountBDesired;
        uint amountAMin;
        uint amountBMin;
        bool reversed;
    }

    /// @notice Stores the reserve of each token pair
    /// @dev reserve[tokenA][tokenB] = amount of tokenA reserved against tokenB
    mapping(address => mapping(address => uint)) public reserve;

    /// @notice Initializes the contract and sets token name/symbol
    constructor() ERC20("Liquidity Token", "LTK") {}

    /// @dev Prevents reentrancy by locking execution
    modifier nonReentrant() {
        require(!locked, "No reentrancy");
        locked = true;
        _;
        locked = false;
    }

    /// @dev Validates that current block timestamp is within deadline
    modifier isNotExpired(uint deadline) {
        require(block.timestamp <= deadline, "Transaction expired");
        _;
    }

    /// @notice Add liquidity to a new or existing token pair
    /// @param tokenA Address of token A
    /// @param tokenB Address of token B
    /// @param amountADesired Amount of token A to add
    /// @param amountBDesired Amount of token B to add
    /// @param amountAMin Minimum amount of token A to accept
    /// @param amountBMin Minimum amount of token B to accept
    /// @param to Recipient of liquidity tokens
    /// @param deadline Latest valid time for this transaction
    /// @return amountA Actual amount of token A added
    /// @return amountB Actual amount of token B added
    /// @return liquidity Amount of liquidity tokens minted
    function addLiquidity(
        address tokenA,
        address tokenB,
        uint amountADesired,
        uint amountBDesired,
        uint amountAMin,
        uint amountBMin,
        address to,
        uint deadline
    )
        external
        nonReentrant
        isNotExpired(deadline)
        returns (uint amountA, uint amountB, uint liquidity)
    {
        require(amountADesired >= amountAMin, "amountADesired too low");
        require(amountBDesired >= amountBMin, "amountBDesired too low");

        // Normalize order of tokens and fetch current reserves
        TokenPairData memory data = reorderTokens(tokenA, tokenB);
        data.amountADesired = data.reversed ? amountBDesired : amountADesired;
        data.amountBDesired = data.reversed ? amountADesired : amountBDesired;
        data.amountAMin = data.reversed ? amountBMin : amountAMin;
        data.amountBMin = data.reversed ? amountAMin : amountBMin;

        bool isInitialLiquidity = false;

        // Ensure reserves are both zero (new pool) or both non-zero (existing pool)
        require(
            (data.reserveA == 0 && data.reserveB == 0) || (data.reserveA > 0 && data.reserveB > 0),
            "Invalid reserve state"
        );

        if (data.reserveA == 0 && data.reserveB == 0) {
            // First liquidity in pool: accept desired amounts directly
            data.amountA = data.amountADesired; 
            data.amountB = data.amountBDesired; 
            isInitialLiquidity = true;
            liquidity = calculateInitialLiquidity(data);
        } else {
            // Calculate optimal amounts based on current reserve ratio
            data.amountB = data.amountBDesired;
            data.amountA = (data.amountBDesired * data.reserveA) / data.reserveB;

            // Check if amountA within acceptable range, otherwise adjust amountB
            if (data.amountA < data.amountAMin || data.amountA > data.amountADesired) {
                data.amountA = data.amountADesired;
                data.amountB = (data.amountADesired * data.reserveB) / data.reserveA;

                require(
                    data.amountB >= amountBMin && data.amountB <= data.amountBDesired,
                    "Amounts do not meet constraints"
                );
            }

            liquidity = calculateExistingLiquidity(data);
        }

        // Transfer tokens and mint liquidity tokens
        addLiquidityTransact(msg.sender, to, data, liquidity, isInitialLiquidity);

        // If tokens were internally reordered, restore output values to match original path order.
        amountA = data.reversed ? data.amountB : data.amountA;
        amountB = data.reversed ? data.amountA : data.amountB;
    }

    /// @dev Executes token transfers and liquidity minting during liquidity provision.
    ///      Extracted into a separate function to avoid "Stack too deep" compiler errors.
    function addLiquidityTransact(
        address from,
        address to,
        TokenPairData memory data,
        uint liquidity,
        bool isInitialLiquidity
    ) internal {
        IERC20(data.tokenA).safeTransferFrom(from, address(this), data.amountA);
        IERC20(data.tokenB).safeTransferFrom(from, address(this), data.amountB);

        _mint(to, liquidity);

        if (isInitialLiquidity) {
            _mint(address(this), MINIMUM_LIQUIDITY);
        }

        reserve[data.tokenA][data.tokenB] += data.amountA;
        reserve[data.tokenB][data.tokenA] += data.amountB;

        emit LiquidityAdded(from, to, data.tokenA, data.tokenB, data.amountA, data.amountB, liquidity);
    }

    /// @notice Emitted when liquidity is added to the pool
    event LiquidityAdded(address indexed from, address indexed to, address tokenA, address TokenB, uint amountA, uint amountB, uint liquidity);    

    /// @dev Computes liquidity to mint for new pool
    ///      Extracted into a separate function to avoid "Stack too deep" compiler errors.
    function calculateInitialLiquidity(TokenPairData memory data) internal pure returns (uint liquidity) {
        liquidity = sqrt(data.amountA * data.amountB) - MINIMUM_LIQUIDITY;
        require(liquidity > 0, "Liquidity too low");
    }

    /// @dev Computes liquidity for existing pool based on proportional contribution
    ///      Extracted into a separate function to avoid "Stack too deep" compiler errors.
    function calculateExistingLiquidity(TokenPairData memory data) internal view returns (uint liquidity) {
        uint256 totalSupplyLTK = totalSupply();
        uint256 liquidityA = (data.amountA * totalSupplyLTK) / data.reserveA;
        uint256 liquidityB = (data.amountB * totalSupplyLTK) / data.reserveB;
        liquidity = liquidityA < liquidityB ? liquidityA : liquidityB;
    }

    /// @notice Removes liquidity from the pool
    /// @param tokenA Address of token A
    /// @param tokenB Address of token B
    /// @param liquidity Amount of liquidity tokens to burn
    /// @param amountAMin Minimum amount of token A to receive
    /// @param amountBMin Minimum amount of token B to receive
    /// @param to Address to send the withdrawn tokens
    /// @param deadline Latest valid time for this transaction
    /// @return amountA Amount of token A returned
    /// @return amountB Amount of token B returned
    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint liquidity,
        uint amountAMin,
        uint amountBMin,
        address to,
        uint deadline
    )
        external
        nonReentrant
        isNotExpired(deadline)
        returns (uint amountA, uint amountB)
    {
        // Ensure the user is not trying to remove zero liquidity.
        require(liquidity > 0, "Zero liquidity");

        // Normalize token order and fetch reserves; also determine if input was reversed.
        TokenPairData memory data = reorderTokens(tokenA, tokenB);

        // Adjust minimum amounts based on whether the original token order was reversed.
        data.amountAMin = data.reversed ? amountBMin : amountAMin;
        data.amountBMin = data.reversed ? amountAMin : amountBMin;

        // Get the total supply of liquidity tokens to calculate proportional amounts.
        uint256 totalSupplyLTK = totalSupply();

        // Calculate the amount of each token to withdraw, proportional to the user's liquidity.
        data.amountA = (liquidity * data.reserveA) / totalSupplyLTK;
        data.amountB = (liquidity * data.reserveB) / totalSupplyLTK;

        // Ensure the withdrawn amounts meet the minimum thresholds set by the user.
        require(data.amountA >= data.amountAMin, "amountA too low");
        require(data.amountB >= data.amountBMin, "amountB too low");

        // Burn the user's liquidity tokens.
        _burn(msg.sender, liquidity);

        // Transfer the corresponding token amounts to the recipient.
        IERC20(data.tokenA).safeTransfer(to, data.amountA);
        IERC20(data.tokenB).safeTransfer(to, data.amountB);

        // Update internal reserves to reflect the removed liquidity.
        reserve[data.tokenA][data.tokenB] -= data.amountA;
        reserve[data.tokenB][data.tokenA] -= data.amountB;

        // Restore the original token order in the returned values.
        amountA = data.reversed ? data.amountB : data.amountA;
        amountB = data.reversed ? data.amountA : data.amountB;

        // Emit an event to log the liquidity removal.
        emit LiquidityRemoved(msg.sender, to, liquidity, data.tokenA, data.tokenB, amountA, amountB);
    }

    /// @notice Emitted when liquidity is removed from the pool
    event LiquidityRemoved(address indexed from, address indexed to, uint256 liquidity, address tokenA, address TokenB, uint256 amountA, uint256 amountB);

    /// @notice Swaps exact tokens for another token based on the current reserve ratio
    /// @param amountIn Amount of input tokens
    /// @param amountOutMin Minimum amount of output tokens required
    /// @param path Token pair involved in swap [tokenIn, tokenOut]
    /// @param to Recipient of output tokens
    /// @param deadline Latest valid time for this transaction
    /// @return amounts [amountIn, amountOut] depending on token order
    function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    )
        external
        nonReentrant
        isNotExpired(deadline)
        returns (uint[] memory amounts)
    {
        require(amountIn > 0, "Zero amountIn");
        require(amountOutMin > 0, "Zero amountOutMin");
        require(path.length == 2, "Only 1-pair swaps allowed");

        uint amountOut;
        TokenPairData memory data = reorderTokens(path[0], path[1]);

        require(data.reserveA > 0 && data.reserveB > 0, "Empty reserves");

        // Calculate output amount using constant product formula
        if (data.reversed)
        {
            amountOut = (amountIn * data.reserveA) / (data.reserveB + amountIn);
            data.amountA = amountOut;
            data.amountB = amountIn;            
        }else{            
            amountOut = (amountIn * data.reserveB) / (data.reserveA + amountIn);
            data.amountA = amountIn;
            data.amountB = amountOut;
        }

        require(data.amountB >= amountOutMin, "Slippage exceeded");

        swapExactTokensForTokensTransact(data, msg.sender, to);

        amounts = new uint[](path.length);
        amounts[0] = data.reversed ? data.amountB : data.amountA;
        amounts[1] = data.reversed ? data.amountA : data.amountB;

        emit SwapExecuted(msg.sender, to, path, amounts);
    }

    /// @dev Normalizes token order to avoid duplicate storage paths
    function reorderTokens(address tokenA, address tokenB) internal view returns (TokenPairData memory data) {
        require(tokenA != tokenB, "Tokens must differ");
        data.reversed = tokenA > tokenB;
        data.tokenA = data.reversed ? tokenB : tokenA; 
        data.tokenB = data.reversed ? tokenA : tokenB; 
        data.reserveA = reserve[data.tokenA][data.tokenB];
        data.reserveB = reserve[data.tokenB][data.tokenA];
    }

    /// @dev Executes internal logic for swaps based on token order
    function swapExactTokensForTokensTransact(
        TokenPairData memory data,
        address from,
        address to
    ) internal {
        if (data.reversed) {
            IERC20(data.tokenA).safeTransfer(to, data.amountA);
            IERC20(data.tokenB).safeTransferFrom(from, address(this), data.amountB);
            reserve[data.tokenA][data.tokenB] -= data.amountB;
            reserve[data.tokenB][data.tokenA] += data.amountA;
        } else {
            IERC20(data.tokenA).safeTransferFrom(from, address(this), data.amountA);
            IERC20(data.tokenB).safeTransfer(to, data.amountB);
            reserve[data.tokenA][data.tokenB] += data.amountA;
            reserve[data.tokenB][data.tokenA] -= data.amountB;
        }            
    }

    /// @notice Emitted when a swap is executed
    event SwapExecuted(address indexed from, address indexed to, address[] path, uint[] amounts);

    /// @notice Gets the price of tokenA in terms of tokenB
    /// @param tokenA Address of base token
    /// @param tokenB Address of quote token
    /// @return price Price scaled by 1e18
    function getPrice(address tokenA, address tokenB) public view returns (uint price) {
        uint reserveA = reserve[tokenA][tokenB];
        uint reserveB = reserve[tokenB][tokenA];
        require(reserveA > 0 && reserveB > 0, "Insufficient reserves");
        return (reserveB * DECIMALS_FACTOR) / reserveA;
    }

    /// @notice Estimates output amount for given input using constant product formula
    function getAmountOut(uint amountIn, uint reserveIn, uint reserveOut) external pure returns (uint amountOut) {
        return (amountIn * reserveOut) / (reserveIn + amountIn);
    }

    /// @dev Computes integer square root using Babylonian method to follow Uniswap documentation
    function sqrt(uint256 x) internal pure returns (uint256) {
        if (x == 0 || x == 1) return x;
        uint256 z = (x / 2) + 1;
        uint256 y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
        return y;
    }
}