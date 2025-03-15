import { ethers, network } from "hardhat";
import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { getChainSpecificPumpFactoryConfig, getChainSpecificFeeSetter } from "../deployment/pumpFactory.config";
import { Addr } from "../deployment/config";

describe("PumpFactory", function () {
  async function deployFactoryFixture() {
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

    return {
      factory,
      owner,
      feeRecipient,
      feeRecipientSetter,
      user,
      tokenTotalSupply,
      tokenCreationFee,
      swapFeePercentage,
      virtualTokenReserve,
      virtualEthReserve,
      ethAmountForLiquidity,
      ethAmountForLiquidityFee,
      ethAmountForDevReward,
    };
  }

  describe("Deployment", function () {
    it("Should deploy with correct initial parameters", async function () {
      const {
        factory,
        feeRecipient,
        tokenTotalSupply,
        tokenCreationFee,
        swapFeePercentage,
      } = await loadFixture(deployFactoryFixture);

      expect(await factory.tokenTotalSupply()).to.equal(tokenTotalSupply);
      expect(await factory.tokenCreationFee()).to.equal(tokenCreationFee);
      expect(await factory.swapFeePercentage()).to.equal(swapFeePercentage);
      expect(await factory.feeRecipient()).to.equal(
        await ethers.getAddress(feeRecipient)
      );
    });

    it("Should set correct owner", async function () {
      const { factory, owner } = await loadFixture(deployFactoryFixture);
      expect(await factory.owner()).to.equal(
        await ethers.getAddress(owner.address)
      );
    });
  });

  describe("Token Creation", function () {
    it("Should create new token with correct parameters", async function () {
      const { factory, user, tokenCreationFee, tokenTotalSupply } =
        await loadFixture(deployFactoryFixture);

      const tokenName = "Test Token";
      const tokenSymbol = "TEST";
      const tokenURI = "https://test.uri";

      await expect(
        factory.connect(user).createToken(tokenName, tokenSymbol, tokenURI, {
          value: tokenCreationFee,
        })
      ).to.emit(factory, "TokenCreated");

      // Get the created token address
      const filter = factory.filters.TokenCreated();
      const events = await factory.queryFilter(filter);
      const tokenAddress = await ethers.getAddress(
        events[events.length - 1].args.token
      );

      const token = await ethers.getContractAt(
        "ERC20FixedSupply",
        tokenAddress
      );
      expect(await token.name()).to.equal(tokenName);
      expect(await token.symbol()).to.equal(tokenSymbol);
      expect(await token.totalSupply()).to.equal(
        ethers.parseEther(tokenTotalSupply.toString())
      );
    });

    it("Should transfer initial token supply to bonding curve", async function () {
      const { factory, user, tokenCreationFee } = await loadFixture(
        deployFactoryFixture
      );

      const tx = await factory
        .connect(user)
        .createToken("Test Token", "TEST", "https://test.uri", {
          value: tokenCreationFee,
        });
      await tx.wait();

      // Get the created token and bonding curve addresses
      const filter = factory.filters.TokenCreated();
      const events = await factory.queryFilter(filter);
      const tokenAddress = await ethers.getAddress(
        events[events.length - 1].args.token
      );
      const bondingCurveAddress = await ethers.getAddress(
        events[events.length - 1].args.bondingCurve
      );

      const token = await ethers.getContractAt(
        "ERC20FixedSupply",
        tokenAddress
      );
      expect(await token.balanceOf(bondingCurveAddress)).to.equal(
        await token.totalSupply()
      );
    });

    it("Should collect correct token creation fee", async function () {
      const { factory, user, feeRecipient, tokenCreationFee } =
        await loadFixture(deployFactoryFixture);

      const initialBalance = await ethers.provider.getBalance(
        feeRecipient
      );

      await factory
        .connect(user)
        .createToken("Test Token", "TEST", "https://test.uri", {
          value: tokenCreationFee,
        });

      expect(await ethers.provider.getBalance(feeRecipient)).to.equal(
        initialBalance + BigInt(tokenCreationFee)
      );
    });

    it("Should handle additional ETH for immediate token purchase", async function () {
      const { factory, user, tokenCreationFee } = await loadFixture(
        deployFactoryFixture
      );

      const purchaseAmount = ethers.parseEther("1"); // 1 ETH for token purchase
      const totalValue = BigInt(tokenCreationFee) + purchaseAmount;

      const tx = await factory
        .connect(user)
        .createToken("Test Token", "TEST", "https://test.uri", {
          value: totalValue,
        });
      await tx.wait();

      // Get the created token address
      const filter = factory.filters.TokenCreated();
      const events = await factory.queryFilter(filter);
      const tokenAddress = await ethers.getAddress(
        events[events.length - 1].args.token
      );

      // Check if user received tokens
      const token = await ethers.getContractAt(
        "ERC20FixedSupply",
        tokenAddress
      );
      expect(await token.balanceOf(user.address)).to.be.gt(0);
    });
  });
});
