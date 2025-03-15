import { ethers, network } from "hardhat";
import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
// import { BondingCurve } from "../typechain-types";
import { getChainSpecificPumpFactoryConfig, getChainSpecificFeeSetter } from "../deployment/pumpFactory.config";

import { Addr } from "../deployment/config";
import { BondingCurve } from "@typechain-types";

describe("BondingCurve Completion", function () {
  async function deployBondingCurveFixture() {
    const [owner, tokenDeveloper, user] = await ethers.getSigners();

    const config = getChainSpecificPumpFactoryConfig(
      network.config.chainId || 0,
      getChainSpecificFeeSetter(network.config.chainId || 0) as Addr,
      getChainSpecificFeeSetter(network.config.chainId || 0) as Addr
    );

    // Deploy Factory first
    const tokenTotalSupply = config.tokenTotalSupply;
    const tokenCreationFee = config.tokenCreationFee;
    const swapFeePercentage = config.swapFeePercentage;
    const virtualTokenReserve = config.virtualTokenReserve;
    const ethAmountForLiquidity = config.ethAmountForLiquidity;
    const ethAmountForLiquidityFee = config.ethAmountForLiquidityFee;
    const ethAmountForDevReward = config.ethAmountForDevReward;

    const feeRecipient = config.feeRecipient;
    const feeRecipientSetter = config.feeRecipientSetter;

    const WETH = config.WETH;
    const ALGEBRA_FACTORY = config.ALGEBRA_FACTORY;
    const ALGEBRA_POSITION_MANAGER = config.ALGEBRA_POSITION_MANAGER;

    const virtualEthReserve = config.virtualEthReserve;
    const factory = await ethers.deployContract("PumpFactory", [
      tokenTotalSupply,
      tokenCreationFee,
      swapFeePercentage,
      virtualTokenReserve,
      virtualEthReserve,
      ethAmountForLiquidity,
      ethAmountForLiquidityFee,
      ethAmountForDevReward,
      feeRecipient,
      feeRecipientSetter,
      WETH,
      ALGEBRA_FACTORY,
      ALGEBRA_POSITION_MANAGER,
    ]);

    // Create a token and get its bonding curve
    const tx = await factory
      .connect(tokenDeveloper)
      .createToken("Test Token", "TEST", "https://test.uri", {
        value: tokenCreationFee,
      });
    await tx.wait();

    // Get the created token and bonding curve addresses
    const filter = factory.filters.TokenCreated();
    const events = await factory.queryFilter(filter);
    const tokenAddress = await ethers.getAddress(
      events[events.length - 1].args.token.toLowerCase()
    );
    const bondingCurveAddress = await ethers.getAddress(
      events[events.length - 1].args.bondingCurve.toLowerCase()
    );

    // Get contract instances
    const token = await ethers.getContractAt("ERC20FixedSupply", tokenAddress);
    const bondingCurve = await ethers.getContractAt(
      "BondingCurve",
      bondingCurveAddress
    );

    return {
      factory,
      token,
      bondingCurve,
      owner,
      tokenDeveloper,
      feeRecipient,
      user,
      virtualTokenReserve,
      virtualEthReserve,
      swapFeePercentage,
      ethAmountForLiquidity,
      ethAmountForLiquidityFee,
      ethAmountForDevReward,
      WETH,
      ALGEBRA_FACTORY,
      ALGEBRA_POSITION_MANAGER
    };
  }

  async function calculateRequiredETHWithFee(
    bondingCurve: BondingCurve,
    swapFeePercentage: string
  ) {
    const remaining = await bondingCurve.remainingEthToCompleteCurve();
    // Include both the remaining amount and the fee amount
    const fee = (remaining * BigInt(swapFeePercentage)) / BigInt(100);
    return remaining + fee;
  }
  describe("Curve Completion Process", function () {
    it("Should complete curve when receiving enough ETH", async function () {
      const { bondingCurve, user, swapFeePercentage } = await loadFixture(
        deployBondingCurveFixture
      );

      const remaining = await bondingCurve.remainingEthToCompleteCurve();

      const requiredETH = await calculateRequiredETHWithFee(
        bondingCurve,
        swapFeePercentage
      );

      // Log current reserves
      const ethReserve = await bondingCurve.ethReserve();
      const tokenReserve = await bondingCurve.tokenReserve();

      // Try to complete the curve
      await expect(
        bondingCurve.connect(user).buy({ value: requiredETH })
      ).to.emit(bondingCurve, "BondingCurveComplete");

      const newEthReserve = await bondingCurve.ethReserve();
      const newTokenReserve = await bondingCurve.tokenReserve();
    });

    it("Should create Algebra pool on completion", async function () {
      const { bondingCurve, token, user, swapFeePercentage, WETH } =
        await loadFixture(deployBondingCurveFixture);

      const requiredETH = await calculateRequiredETHWithFee(
        bondingCurve,
        swapFeePercentage
      );

      const tx = await bondingCurve.connect(user).buy({ value: requiredETH });
      const receipt = await tx.wait();

      // Find BondingCurveComplete event
      const completeEvent = receipt?.logs?.find((log) => {
        try {
          const parsedLog = bondingCurve.interface.parseLog(log);
          return parsedLog?.name === "BondingCurveComplete";
        } catch {
          return false;
        }
      });
      expect(completeEvent).to.not.be.undefined;

      if (!completeEvent) {
        throw new Error("BondingCurveComplete event not found");
      }

      const parsedLog = bondingCurve.interface.parseLog(completeEvent);
      if (!parsedLog) {
        throw new Error("Could not parse BondingCurveComplete event");
      }

      const liquidityPoolAddress = parsedLog.args[1]; // second argument in the event
      expect(liquidityPoolAddress).to.not.equal(ethers.ZeroAddress);

      // Verify pool has tokens and WETH
      const algebraPool = await ethers.getContractAt(
        "IAlgebraPool",
        liquidityPoolAddress
      );
      const tokenAddress = await token.getAddress();
      const [token0, token1] =
        tokenAddress.toLowerCase() < WETH.toLowerCase()
          ? [tokenAddress, WETH]
          : [WETH, tokenAddress];

      expect(await algebraPool.token0()).to.equal(token0);
      expect(await algebraPool.token1()).to.equal(token1);
    });

    it("Should distribute rewards correctly on completion", async function () {
      const {
        bondingCurve,
        tokenDeveloper,
        feeRecipient,
        ethAmountForDevReward,
        ethAmountForLiquidityFee,
        user,
        swapFeePercentage,
      } = await loadFixture(deployBondingCurveFixture);

      const initialDevBalance = await ethers.provider.getBalance(
        tokenDeveloper.address
      );
      const initialFeeRecipientBalance = await ethers.provider.getBalance(
        feeRecipient
      );

      const requiredETH = await calculateRequiredETHWithFee(
        bondingCurve,
        swapFeePercentage
      );
      await bondingCurve.connect(user).buy({ value: requiredETH });

      // Check developer reward
      const finalDevBalance = await ethers.provider.getBalance(
        tokenDeveloper.address
      );
      expect(finalDevBalance - initialDevBalance).to.equal(
        ethAmountForDevReward
      );

      // Check liquidity fee
      const finalFeeRecipientBalance = await ethers.provider.getBalance(
        feeRecipient
      );
      // Fee recipient gets both the liquidity fee and the buy fee
      const buyFee = (requiredETH * BigInt(swapFeePercentage)) / BigInt(100);
      expect(
        finalFeeRecipientBalance - initialFeeRecipientBalance
      ).to.be.approximately(
        BigInt(ethAmountForLiquidityFee) + buyFee,
        ethers.parseEther("0.01")
      );
    });

    it("Should refund excess ETH if sending more than required", async function () {
      const { bondingCurve, user, swapFeePercentage } = await loadFixture(
        deployBondingCurveFixture
      );

      const requiredETH = await calculateRequiredETHWithFee(
        bondingCurve,
        swapFeePercentage
      );
      const excess = ethers.parseEther("1");

      const initialBalance = await ethers.provider.getBalance(user.address);
      const tx = await bondingCurve
        .connect(user)
        .buy({ value: requiredETH + excess });
      const receipt = await tx.wait();

      const finalBalance = await ethers.provider.getBalance(user.address);

      const amountSpent = initialBalance - finalBalance;
      expect(amountSpent).to.be.approximately(
        requiredETH,
        ethers.parseEther("0.01")
      );
    });

    it("Should set isActive to false after completion", async function () {
      const { bondingCurve, user, swapFeePercentage } = await loadFixture(
        deployBondingCurveFixture
      );

      expect(await bondingCurve.isActive()).to.be.true;

      const requiredETH = await calculateRequiredETHWithFee(
        bondingCurve,
        swapFeePercentage
      );
      await bondingCurve.connect(user).buy({ value: requiredETH });

      expect(await bondingCurve.isActive()).to.be.false;
    });

    it("Should revert direct ETH transfers", async function () {
      const { bondingCurve, user } = await loadFixture(
        deployBondingCurveFixture
      );

      await expect(
        user.sendTransaction({
          to: bondingCurve.getAddress(),
          value: ethers.parseEther("1"),
        })
      ).to.be.reverted;
    });
  });
});
