import { ethers, network } from "hardhat";
import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { BondingCurve } from "../typechain-types";
import {
  getChainSpecificFeeSetter,
  getChainSpecificPumpFactoryConfig,
} from "../deployment/pumpFactory.config";
import { Addr } from "../deployment/config";

async function calculateRequiredETHWithFee(
  bondingCurve: BondingCurve,
  swapFeePercentage: string
) {
  const remaining = await bondingCurve.remainingEthToCompleteCurve();
  // Include both the remaining amount and the fee amount
  const fee = (remaining * BigInt(swapFeePercentage)) / BigInt(100);
  return remaining + fee;
}

describe("BondingCurve Operations", function () {
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
    
    await factory.waitForDeployment()

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
    };
  }

  describe("Initial State", function () {
    it("Should initialize with correct parameters", async function () {
      const {
        bondingCurve,
        token,
        tokenDeveloper,
        virtualTokenReserve,
        virtualEthReserve,
        swapFeePercentage,
      } = await loadFixture(deployBondingCurveFixture);

      expect(await bondingCurve.tokenContract()).to.equal(
        await token.getAddress()
      );
      expect(await bondingCurve.TOKEN_DEVELOPER()).to.equal(
        await ethers.getAddress(tokenDeveloper.address.toLowerCase())
      );
      expect(await bondingCurve.VIRTUAL_TOKEN_RESERVE()).to.equal(
        virtualTokenReserve
      );
      expect(await bondingCurve.VIRTUAL_ETH_RESERVE()).to.equal(
        virtualEthReserve
      );
      expect(await bondingCurve.swapFeePercentage()).to.equal(
        swapFeePercentage
      );
      expect(await bondingCurve.isActive()).to.be.true;
    });
  });

  describe("Token Purchase", function () {
    it("Should calculate buy amount correctly", async function () {
      const { bondingCurve, user } = await loadFixture(
        deployBondingCurveFixture
      );

      const ethAmount = ethers.parseEther("1");
      const initialBalance = await bondingCurve
        .tokenContract()
        .then((addr) => ethers.getContractAt("ERC20FixedSupply", addr))
        .then((token) => token.balanceOf(user.address));

      await bondingCurve.connect(user).buy({ value: ethAmount });

      const finalBalance = await bondingCurve
        .tokenContract()
        .then((addr) => ethers.getContractAt("ERC20FixedSupply", addr))
        .then((token) => token.balanceOf(user.address));

      expect(finalBalance).to.be.gt(initialBalance);
    });

    it("Should update reserves after purchase", async function () {
      const { bondingCurve, user, swapFeePercentage } = await loadFixture(
        deployBondingCurveFixture
      );

      const ethAmount = ethers.parseEther("1");
      const initialEthReserve = await bondingCurve.ethReserve();
      const initialTokenReserve = await bondingCurve.tokenReserve();

      await bondingCurve.connect(user).buy({ value: ethAmount });

      const finalEthReserve = await bondingCurve.ethReserve();
      const finalTokenReserve = await bondingCurve.tokenReserve();

      const buyFee = (ethAmount * BigInt(swapFeePercentage)) / BigInt(100);
      const effectiveEth = ethAmount - buyFee;

      // Use approximately equal for reserve checks
      expect(finalEthReserve).to.be.approximately(
        initialEthReserve + effectiveEth,
        ethers.parseEther("0.01")
      );
      expect(finalTokenReserve).to.be.lt(initialTokenReserve);
    });

    it("Should collect correct fees on purchase", async function () {
      const { bondingCurve, user, feeRecipient, swapFeePercentage } =
        await loadFixture(deployBondingCurveFixture);

      const ethAmount = ethers.parseEther("1");
      const initialFeeRecipientBalance = await ethers.provider.getBalance(
        feeRecipient
      );

      await bondingCurve.connect(user).buy({ value: ethAmount });

      const finalFeeRecipientBalance = await ethers.provider.getBalance(
        feeRecipient
      );
      const expectedFee = (ethAmount * BigInt(swapFeePercentage)) / BigInt(100);

      // Use approximately equal for fee checks
      expect(
        finalFeeRecipientBalance - initialFeeRecipientBalance
      ).to.be.approximately(expectedFee, ethers.parseEther("0.01"));
    });

    it("Should revert if curve is inactive", async function () {
      const { bondingCurve, user, swapFeePercentage } = await loadFixture(
        deployBondingCurveFixture
      );

      // Complete the bonding curve to make it inactive
      const requiredETH = await calculateRequiredETHWithFee(
        bondingCurve,
        swapFeePercentage
      );

      // First complete the curve
      await bondingCurve.connect(user).buy({ value: requiredETH });

      const requiredETH2 = await calculateRequiredETHWithFee(
        bondingCurve,
        swapFeePercentage
      );

      // Verify curve is inactive
      expect(await bondingCurve.isActive()).to.be.false;

      // Try to buy after completion
      await expect(
        bondingCurve.connect(user).buy({ value: ethers.parseEther("1") })
      ).to.be.revertedWithCustomError(bondingCurve, "InactiveBondingCurve");
    });
  });

  describe("Token Sale", function () {
    async function setupTokenSale() {
      const fixture = await deployBondingCurveFixture();

      // Buy some tokens first with a substantial amount
      const buyAmount = ethers.parseEther("2");
      await fixture.bondingCurve
        .connect(fixture.user)
        .buy({ value: buyAmount });

      // Approve tokens for selling
      const token = await ethers.getContractAt(
        "ERC20FixedSupply",
        await fixture.bondingCurve.tokenContract()
      );
      const userBalance = await token.balanceOf(fixture.user.address);
      await token
        .connect(fixture.user)
        .approve(fixture.bondingCurve.getAddress(), userBalance);

      return { ...fixture, userBalance };
    }

    it("Should calculate sell amount correctly", async function () {
      const { bondingCurve, user, token, userBalance } = await loadFixture(
        setupTokenSale
      );

      const sellAmount = userBalance / BigInt(2);
      const initialEthBalance = await ethers.provider.getBalance(user.address);

      const tx = await bondingCurve.connect(user).sell(sellAmount);
      const receipt = await tx.wait();
      const gasCost = receipt!.gasUsed * receipt!.gasPrice;

      const finalEthBalance = await ethers.provider.getBalance(user.address);
      expect(finalEthBalance + gasCost).to.be.gt(initialEthBalance);
    });

    it("Should update reserves after sale", async function () {
      const { bondingCurve, user, userBalance } = await loadFixture(
        setupTokenSale
      );

      const sellAmount = userBalance / BigInt(2);
      const initialEthReserve = await bondingCurve.ethReserve();
      const initialTokenReserve = await bondingCurve.tokenReserve();

      await bondingCurve.connect(user).sell(sellAmount);

      const finalEthReserve = await bondingCurve.ethReserve();
      const finalTokenReserve = await bondingCurve.tokenReserve();

      expect(finalEthReserve).to.be.lt(initialEthReserve);
      expect(finalTokenReserve).to.equal(initialTokenReserve + sellAmount);
    });

    it("Should collect correct fees on sale", async function () {
      const { bondingCurve, user, feeRecipient, userBalance } =
        await loadFixture(setupTokenSale);

      const sellAmount = userBalance / BigInt(2);
      const initialFeeRecipientBalance = await ethers.provider.getBalance(
        feeRecipient
      );

      await bondingCurve.connect(user).sell(sellAmount);

      const finalFeeRecipientBalance = await ethers.provider.getBalance(
        feeRecipient
      );
      expect(finalFeeRecipientBalance).to.be.gt(initialFeeRecipientBalance);
    });

    it("Should revert if trying to sell more than balance", async function () {
      const { bondingCurve, user, token } = await loadFixture(setupTokenSale);

      const userBalance = await token.balanceOf(user.address);
      await expect(bondingCurve.connect(user).sell(userBalance + BigInt(1))).to
        .be.reverted;
    });
    it("Should revert if curve is inactive", async function () {
      const { bondingCurve, user, userBalance, swapFeePercentage } =
        await loadFixture(setupTokenSale);

      // Complete the bonding curve
      const requiredETH = await calculateRequiredETHWithFee(
        bondingCurve,
        swapFeePercentage
      );

      // First complete the curve
      await bondingCurve.connect(user).buy({ value: requiredETH });

      // Verify curve is inactive
      expect(await bondingCurve.isActive()).to.be.false;

      // Try to sell after completion
      await expect(
        bondingCurve.connect(user).sell(userBalance)
      ).to.be.revertedWithCustomError(bondingCurve, "InactiveBondingCurve");
    });
  });
});
