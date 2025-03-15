// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPumpFactory} from "./interfaces/IPumpFactory.sol";
import {IWETH} from "./interfaces/IWETH.sol";
import {ILaunch} from "./interfaces/ILaunch.sol";

import "@cryptoalgebra/integral-core/contracts/interfaces/IAlgebraFactory.sol";
import "@cryptoalgebra/integral-core/contracts/interfaces/IAlgebraPool.sol";
import "@cryptoalgebra/integral-periphery/contracts/interfaces/INonfungiblePositionManager.sol";

interface IERC721Receiver {
    function onERC721Received(address operator, address from, uint256 tokenId, bytes calldata data)
        external
        returns (bytes4);
}

contract BondingCurve is IERC721Receiver {
    IERC20 public immutable tokenContract;
    uint256 public ethReserve;
    uint256 public tokenReserve;

    uint256 public immutable VIRTUAL_ETH_RESERVE;
    uint256 public immutable VIRTUAL_TOKEN_RESERVE;

    uint256 public swapFeePercentage;

    uint256 public immutable ETH_AMOUNT_FOR_LIQUIDITY;
    uint256 public immutable ETH_AMOUNT_FOR_LIQUIDITY_FEE;
    uint256 public immutable ETH_AMOUNT_FOR_DEV_REWARD;
    uint256 public immutable TOTAL_ETH_TO_COMPLETE_CURVE;

    address public immutable TOKEN_DEVELOPER;

    INonfungiblePositionManager private nonFungiblePositionManager;

    IPumpFactory private factoryContract;
    bool public isActive = true;

    address private immutable WETH;
    address private immutable ALGEBRA_FACTORY;
    int24 private TICK_EXTREME = 887220;

    event LogBuy(uint256 indexed amountBought, uint256 indexed totalCost, address indexed buyer);
    event LogSell(uint256 indexed amountSell, uint256 indexed reward, address indexed seller);
    event BondingCurveComplete(address indexed tokenAddress, address indexed liquidityPoolAddress);

    error InactiveBondingCurve();
    error TransferFailed();
    error Forbidden();
    error InsufficientFunds();
    error ApproveFailed();

    /// @notice Creates a new BondingCurve instance
    /// @dev Sets up initial parameters and connects to external contracts
    /// @param _tokenDeveloper Address of the token developer
    /// @param _tokenAddress Address of the token contract
    /// @param _virtualTokenReserve Initial virtual token reserve
    /// @param _virtualEthReserve Initial virtual ETH reserve
    /// @param _swapFeePercentage Percentage fee for swaps
    /// @param _ethAmountForLiquidity ETH amount to be used for liquidity
    /// @param _ethAmountForLiquidityFee ETH amount for liquidity fee
    /// @param _ethAmountForDevReward ETH amount for developer reward
    constructor(
        address _tokenDeveloper,
        address _tokenAddress,
        uint256 _virtualTokenReserve,
        uint256 _virtualEthReserve,
        uint256 _swapFeePercentage,
        uint256 _ethAmountForLiquidity,
        uint256 _ethAmountForLiquidityFee,
        uint256 _ethAmountForDevReward,
        address _weth,
        address _algebraFactory,
        address _algebraPositionManager
    ) {
        TOKEN_DEVELOPER = _tokenDeveloper;
        tokenContract = IERC20(_tokenAddress);

        VIRTUAL_TOKEN_RESERVE = _virtualTokenReserve;
        VIRTUAL_ETH_RESERVE = _virtualEthReserve;

        tokenReserve = _virtualTokenReserve;
        ethReserve = _virtualEthReserve;

        swapFeePercentage = _swapFeePercentage;

        ETH_AMOUNT_FOR_LIQUIDITY = _ethAmountForLiquidity;
        ETH_AMOUNT_FOR_LIQUIDITY_FEE = _ethAmountForLiquidityFee;
        ETH_AMOUNT_FOR_DEV_REWARD = _ethAmountForDevReward;

        TOTAL_ETH_TO_COMPLETE_CURVE =
            ETH_AMOUNT_FOR_LIQUIDITY + ETH_AMOUNT_FOR_LIQUIDITY_FEE + ETH_AMOUNT_FOR_DEV_REWARD + VIRTUAL_ETH_RESERVE;

        factoryContract = IPumpFactory(msg.sender);

        WETH = _weth;
        ALGEBRA_FACTORY = _algebraFactory;
        nonFungiblePositionManager = INonfungiblePositionManager(_algebraPositionManager);
    }

    /// @notice Deactivates the bonding curve
    /// @dev This function is called internally when the curve is completed
    function _deactivateBondingCurve() internal {
        isActive = false;
    }

    /// @notice Handles token purchase for a specified buyer
    /// @dev This internal function is called by the public buy functions
    /// @param buyer Address of the token buyer
    /// @return bool Returns true if the purchase was successful
    function _buyFor(address buyer) internal returns (bool) {
        if (!isActive) revert InactiveBondingCurve();
        require(msg.value > 0);

        uint256 buyFee = _calculateBuyFee(msg.value);
        uint256 effectiveEth = msg.value - buyFee;
        uint256 refund = 0;
        bool bondingCurveComplete = false;

        uint256 requiredEthToCompleteCurve = remainingEthToCompleteCurve();

        if (effectiveEth >= requiredEthToCompleteCurve) {
            effectiveEth = requiredEthToCompleteCurve;
            buyFee = _calculateBuyFee(requiredEthToCompleteCurve);

            refund = msg.value - effectiveEth - buyFee;
            bondingCurveComplete = true;
            _deactivateBondingCurve();
        }

        uint256 tokensToTransfer = _getAmountOut(effectiveEth, ethReserve, tokenReserve);

        ethReserve += effectiveEth;
        tokenReserve -= tokensToTransfer;

        if (!tokenContract.transfer(buyer, tokensToTransfer)) revert TransferFailed();

        // Transfer fees to the fee recipient
        address feeRecipient = factoryContract.feeRecipient();
        _safeTransferETH(feeRecipient, buyFee);

        if (refund > 0) {
            _safeTransferETH(buyer, refund);
        }

        emit LogBuy(tokensToTransfer, effectiveEth + buyFee, buyer);

        if (bondingCurveComplete) {
            _completeBondingCurve();

            _safeTransferETH(TOKEN_DEVELOPER, ETH_AMOUNT_FOR_DEV_REWARD);

            _safeTransferETH(factoryContract.feeRecipient(), ETH_AMOUNT_FOR_LIQUIDITY_FEE);
        }
        return true;
    }

    /// @notice Buys tokens for the message sender
    /// @return A boolean indicating whether the purchase was successful
    function buy() public payable returns (bool) {
        return _buyFor(msg.sender);
    }

    function buyFor(address buyer) external payable {
        if (msg.sender != address(factoryContract)) revert Forbidden();
        _buyFor(buyer);
    }

    /// @notice Sells a specified amount of tokens
    /// @param tokenAmount The amount of tokens to sell
    /// @return A boolean indicating whether the sale was successful
    function sell(uint256 tokenAmount) public returns (bool) {
        if (!isActive) revert InactiveBondingCurve();
        require(tokenAmount > 0);

        uint256 ethAmount = _getAmountOut(tokenAmount, tokenReserve, ethReserve);

        if (ethAmount > address(this).balance) revert InsufficientFunds();

        uint256 sellFee = _calculateSellFee(ethAmount);
        uint256 effectiveEthAmount = ethAmount - sellFee;

        ethReserve -= ethAmount;
        tokenReserve += tokenAmount;

        _safeTransferETH(msg.sender, effectiveEthAmount);

        if (!tokenContract.transferFrom(msg.sender, address(this), tokenAmount)) revert TransferFailed();

        // Transfer fees to the fee recipient
        address feeTo = factoryContract.feeRecipient();

        _safeTransferETH(feeTo, sellFee);

        emit LogSell(tokenAmount, ethAmount, msg.sender);
        return true;
    }

    function _safeTransferETH(address to, uint256 amount) internal {
        (bool success,) = to.call{value: amount}("");
        require(success, "ETH transfer failed");
    }

    /// @notice Completes the bonding curve by adding liquidity to Uniswap
    /// @dev This function is called internally when the curve is filled
    function _completeBondingCurve() internal {
        uint256 ethAmountToSendLP = ETH_AMOUNT_FOR_LIQUIDITY;
        uint256 tokenAmountToSendLP = tokenContract.balanceOf(address(this));

        IWETH(WETH).deposit{value: ethAmountToSendLP}();

        (address pool) = IAlgebraFactory(ALGEBRA_FACTORY).createPool(address(tokenContract), WETH, "");
        (uint256 reserve0, uint256 reserve1) = address(tokenContract) < WETH
            ? (tokenAmountToSendLP, ethAmountToSendLP)
            : (ethAmountToSendLP, tokenAmountToSendLP);
        IAlgebraPool(pool).initialize(getSqrtPriceX96(reserve0, reserve1));

        if (!tokenContract.approve(address(nonFungiblePositionManager), tokenAmountToSendLP)) revert ApproveFailed();
        if (!IERC20(WETH).approve(address(nonFungiblePositionManager), ethAmountToSendLP)) revert ApproveFailed();

        nonFungiblePositionManager.mint(
            INonfungiblePositionManager.MintParams({
                token0: address(tokenContract) < WETH ? address(tokenContract) : WETH,
                token1: address(tokenContract) < WETH ? WETH : address(tokenContract),
                deployer: address(0),
                tickLower: -TICK_EXTREME,
                tickUpper: TICK_EXTREME,
                amount0Desired: reserve0,
                amount1Desired: reserve1,
                amount0Min: 0,
                amount1Min: 0,
                recipient: address(this),
                deadline: block.timestamp + 1
            })
        );

        ILaunch(address(tokenContract)).launch();

        emit BondingCurveComplete(address(tokenContract), pool);
    }

    /// @notice Calculates the fee for buying tokens
    /// @dev Uses the current swap fee percentage to calculate the fee
    /// @param amount The amount of ETH being used to buy tokens
    /// @return The calculated buy fee
    function _calculateBuyFee(uint256 amount) internal view returns (uint256) {
        return (amount / (100 + swapFeePercentage)) * swapFeePercentage;
    }

    /// @notice Calculates the fee for selling tokens
    /// @dev Uses the current swap fee percentage to calculate the fee
    /// @param amount The amount of tokens being sold
    /// @return The calculated sell fee
    function _calculateSellFee(uint256 amount) internal view returns (uint256) {
        return (amount * swapFeePercentage) / 100;
    }

    /// @notice Calculates the remaining ETH needed to complete the curve
    /// @dev Subtracts the current ETH reserve from the total ETH needed
    /// @return The amount of ETH needed to complete the curve
    function remainingEthToCompleteCurve() public view returns (uint256) {
        return TOTAL_ETH_TO_COMPLETE_CURVE - ethReserve;
    }

    /// @notice Calculates the output amount for a given input in a constant product market maker
    /// @dev Uses the formula (dx * y) / (x + dx) to calculate the output
    /// @param amountIn The input amount
    /// @param reserveIn The reserve of the input token
    /// @param reserveOut The reserve of the output token
    /// @return The calculated output amount
    function _getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut) internal pure returns (uint256) {
        // (x + dx)(y - dy) = xy
        // dx.y - dx.dy - x.dy = 0
        // dx.y = dy(x + dx)
        // dx.y / (x + dx) = dy
        return (amountIn * reserveOut) / (reserveIn + amountIn);
    }

    // Calculate sqrtPriceX96 from reserveA and reserveB
    function getSqrtPriceX96(uint256 reserveA, uint256 reserveB) internal pure returns (uint160) {
        require(reserveA > 0 && reserveB > 0, "Reserves must be greater than 0");

        uint256 ratioX192 = reserveB * (2 ** 192 / reserveA); // Scale ratio by 2**192
        return uint160(_sqrt(ratioX192)); // Take the square root and cast to uint160
    }

    // Internal function to compute square root using the Babylonian method
    function _sqrt(uint256 x) internal pure returns (uint256) {
        if (x == 0) return 0;

        // Initial estimate
        uint256 z = (x + (2 ** 96)) / 2;
        uint256 y = x;

        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }

        return y;
    }

    /// @notice Prevents accidental ETH transfers to the contract
    /// @dev This function reverts all incoming ETH transfers
    receive() external payable {
        revert();
    }

    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }
}
