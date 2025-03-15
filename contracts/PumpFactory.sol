// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IOwnable} from "./interfaces/IOwnable.sol";

import {ERC20FixedSupply} from "./ERC20FixedSupply.sol";
import {BondingCurve} from "./BondingCurve.sol";

contract PumpFactory is Ownable {
    mapping(address => address) public getTokenBondingCurve;

    uint256 public tokenTotalSupply;
    address public feeRecipient;
    address public feeRecipientSetter;

    uint256 public tokenCreationFee;
    uint256 public swapFeePercentage;

    uint256 private virtualTokenReserve;
    uint256 private virtualEthReserve;

    uint256 private ethAmountForLiquidity;
    uint256 private ethAmountForLiquidityFee;
    uint256 private ethAmountForDevReward;

    address private immutable WETH;
    address private immutable ALGEBRA_FACTORY;
    address private immutable ALGEBRA_POSITION_MANAGER;

    event TokenCreated(address indexed token, address indexed bondingCurve);
    event VirtualReservesUpdated(uint256 tokenReserve, uint256 ethReserve);
    event EthAmountsUpdated(uint256 forLiquidity, uint256 forLiquidityFee, uint256 forDevReward);
    event SwapFeePercentageUpdated(uint256 newPercentage);
    event TokenTotalSupplyUpdated(uint256 newSupply);

    error TransferFailed();
    error Forbidden();
    error InvalidPercentage();

    /// @notice Creates a new PumpFactory instance
    /// @dev Sets up initial parameters for token creation and bonding curves
    /// @param _tokenTotalSupply Total supply for created tokens
    /// @param _swapFeePercentage Percentage fee for swaps
    /// @param _virtualTokenReserve Initial virtual token reserve for bonding curves
    /// @param _virtualEthReserve Initial virtual ETH reserve for bonding curves
    /// @param _ethAmountForLiquidity ETH amount to be used for liquidity in bonding curves
    /// @param _ethAmountForLiquidityFee ETH amount for liquidity fee in bonding curves
    /// @param _ethAmountForDevReward ETH amount for developer reward in bonding curves
    /// @param _feeRecipient Address to receive fees
    /// @param _feeRecipientSetter Address allowed to change the fee recipient
    constructor(
        uint256 _tokenTotalSupply,
        uint256 _tokenCreationFee,
        uint256 _swapFeePercentage,
        uint256 _virtualTokenReserve,
        uint256 _virtualEthReserve,
        uint256 _ethAmountForLiquidity,
        uint256 _ethAmountForLiquidityFee,
        uint256 _ethAmountForDevReward,
        address _feeRecipient,
        address _feeRecipientSetter,
        address _weth,
        address _algebraFactory,
        address _algebraPositionManager
    ) Ownable(msg.sender) {
        tokenTotalSupply = _tokenTotalSupply;
        tokenCreationFee = _tokenCreationFee;
        swapFeePercentage = _swapFeePercentage;

        virtualTokenReserve = _virtualTokenReserve;
        virtualEthReserve = _virtualEthReserve;

        ethAmountForLiquidity = _ethAmountForLiquidity;
        ethAmountForLiquidityFee = _ethAmountForLiquidityFee;
        ethAmountForDevReward = _ethAmountForDevReward;

        feeRecipientSetter = _feeRecipientSetter;
        feeRecipient = _feeRecipient;

        WETH = _weth;
        ALGEBRA_FACTORY = _algebraFactory;
        ALGEBRA_POSITION_MANAGER = _algebraPositionManager;
    }

    /// @notice Creates a new token and its associated bonding curve
    /// @dev Deploys a new ERC20FixedSupply token and a BondingCurve contract
    /// @param name The name of the new token
    /// @param symbol The symbol of the new token
    /// @param tokenURI The URI for token metadata
    /// @return The address of the newly created token
    function createToken(string memory name, string memory symbol, string memory tokenURI)
        external
        payable
        returns (address)
    {
        uint256 msgValue = msg.value;

        ERC20FixedSupply token = new ERC20FixedSupply(name, symbol, tokenTotalSupply, tokenURI);
        BondingCurve bondingCurve = new BondingCurve(
            address(msg.sender),
            address(token),
            virtualTokenReserve,
            virtualEthReserve,
            swapFeePercentage,
            ethAmountForLiquidity,
            ethAmountForLiquidityFee,
            ethAmountForDevReward,
            WETH,
            ALGEBRA_FACTORY,
            ALGEBRA_POSITION_MANAGER
        );

        if (!token.transfer(address(bondingCurve), token.totalSupply())) revert TransferFailed();

        getTokenBondingCurve[address(token)] = address(bondingCurve);

        IOwnable(address(token)).transferOwnership(address(bondingCurve));

        emit TokenCreated(address(token), address(bondingCurve));

        _safeTransferETH(feeRecipient, tokenCreationFee);

        if (msg.value > tokenCreationFee) {
            bondingCurve.buyFor{value: msgValue - tokenCreationFee}(msg.sender);
        }

        return address(token);
    }

    function _safeTransferETH(address to, uint256 amount) internal {
        (bool success,) = payable(to).call{value: amount}("");
        require(success, "ETH transfer failed");
    }

    /// @notice Sets a new address that can change the fee recipient
    /// @dev Can only be called by the current feeRecipientSetter
    /// @param _feeRecipientSetter The new address that can set the fee recipient
    function setFeeRecipientSetter(address _feeRecipientSetter) external {
        if (msg.sender != feeRecipientSetter) revert Forbidden();
        feeRecipientSetter = _feeRecipientSetter;
    }

    /// @notice Sets a new fee recipient address
    /// @dev Can only be called by the current feeRecipientSetter
    /// @param _feeRecipient The new address to receive fees
    function setFeeRecipient(address _feeRecipient) external {
        if (msg.sender != feeRecipientSetter) revert Forbidden();
        feeRecipient = _feeRecipient;
    }

    /// @notice Updates the virtual reserves used for new bonding curves
    /// @dev Can only be called by the contract owner
    /// @param _tokenReserve The new virtual token reserve
    /// @param _ethReserve The new virtual ETH reserve
    function setVirtualReserves(uint256 _tokenReserve, uint256 _ethReserve) external onlyOwner {
        virtualTokenReserve = _tokenReserve;
        virtualEthReserve = _ethReserve;
        emit VirtualReservesUpdated(_tokenReserve, _ethReserve);
    }

    /// @notice Updates the ETH amounts used for liquidity, fees, and rewards in new bonding curves
    /// @dev Can only be called by the contract owner
    /// @param _forLiquidity The new ETH amount for liquidity
    /// @param _forLiquidityFee The new ETH amount for liquidity fee
    /// @param _forDevReward The new ETH amount for developer reward
    function setEthAmounts(uint256 _forLiquidity, uint256 _forLiquidityFee, uint256 _forDevReward) external onlyOwner {
        ethAmountForLiquidity = _forLiquidity;
        ethAmountForLiquidityFee = _forLiquidityFee;
        ethAmountForDevReward = _forDevReward;
        emit EthAmountsUpdated(_forLiquidity, _forLiquidityFee, _forDevReward);
    }

    /// @notice Updates the swap fee percentage for new bonding curves
    /// @dev Can only be called by the contract owner
    /// @param _newPercentage The new swap fee percentage (0-100)
    function setSwapFeePercentage(uint256 _newPercentage) external onlyOwner {
        if (_newPercentage > 100) revert InvalidPercentage();
        swapFeePercentage = _newPercentage;
        emit SwapFeePercentageUpdated(_newPercentage);
    }

    /// @notice Updates the total supply for new tokens
    /// @dev Can only be called by the contract owner
    /// @param _newSupply The new total supply for tokens created by this factory
    function setTokenTotalSupply(uint256 _newSupply) external onlyOwner {
        tokenTotalSupply = _newSupply;
        emit TokenTotalSupplyUpdated(_newSupply);
    }
}
