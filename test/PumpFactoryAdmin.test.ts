import { ethers, network } from "hardhat";
import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import {
  getChainSpecificFeeSetter,
  getChainSpecificPumpFactoryConfig,
} from "../deployment/pumpFactory.config";
import { Addr } from "../deployment/config";

describe("PumpFactory Admin Functions", function () {
  async function deployFactoryFixture() {
    const [owner, newFeeRecipient, newFeeRecipientSetter, user] =
      await ethers.getSigners();

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
      newFeeRecipient,
      newFeeRecipientSetter,
      user,
      tokenTotalSupply,
      swapFeePercentage,
      virtualTokenReserve,
      virtualEthReserve,
      ethAmountForLiquidity,
      ethAmountForLiquidityFee,
      ethAmountForDevReward,
    };
  }

  beforeEach(async function() {
    // Impersonate the specific address
    await network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [getChainSpecificFeeSetter(network.config.chainId || 0)],
    });
    
    // // Fund the impersonated account if needed
    // await network.provider.send("hardhat_setBalance", [
    //     FEE_SETTER,
    //     "0x1000000000000000000", // 1 ETH in hex
    // ]);
});


  describe("Fee Recipient Management", function () {
    it("Should allow fee recipient setter to change fee recipient", async function () {
      const { factory, feeRecipientSetter, newFeeRecipient } =
        await loadFixture(deployFactoryFixture);

      const feeRecipientSetterSigner = await ethers.getSigner(
        feeRecipientSetter
      );

      await factory
        .connect(feeRecipientSetterSigner)
        .setFeeRecipient(
          await ethers.getAddress(newFeeRecipient.address.toLowerCase())
        );

      expect(await factory.feeRecipient()).to.equal(
        await ethers.getAddress(newFeeRecipient.address.toLowerCase())
      );
    });

    it("Should prevent non-fee-recipient-setter from changing fee recipient", async function () {
      const { factory, user, newFeeRecipient } = await loadFixture(
        deployFactoryFixture
      );

      await expect(
        factory
          .connect(user)
          .setFeeRecipient(
            await ethers.getAddress(newFeeRecipient.address.toLowerCase())
          )
      ).to.be.revertedWithCustomError(factory, "Forbidden");
    });

    it("Should allow fee recipient setter to change fee recipient setter", async function () {
      const { factory, feeRecipientSetter, newFeeRecipientSetter } =
        await loadFixture(deployFactoryFixture);

      const feeRecipientSetterSigner = await ethers.getSigner(
        feeRecipientSetter
      );

      await factory
        .connect(feeRecipientSetterSigner)
        .setFeeRecipientSetter(
          await ethers.getAddress(newFeeRecipientSetter.address.toLowerCase())
        );

      expect(await factory.feeRecipientSetter()).to.equal(
        await ethers.getAddress(newFeeRecipientSetter.address.toLowerCase())
      );
    });

    it("Should prevent non-fee-recipient-setter from changing fee recipient setter", async function () {
      const { factory, user, newFeeRecipientSetter } = await loadFixture(
        deployFactoryFixture
      );

      await expect(
        factory
          .connect(user)
          .setFeeRecipientSetter(
            await ethers.getAddress(newFeeRecipientSetter.address.toLowerCase())
          )
      ).to.be.revertedWithCustomError(factory, "Forbidden");
    });
  });

  describe("Owner Settings Management", function () {
    it("Should allow owner to update virtual reserves", async function () {
      const { factory, owner } = await loadFixture(deployFactoryFixture);

      const newTokenReserve = ethers.parseEther("200000");
      const newEthReserve = ethers.parseEther("20");

      await expect(
        factory
          .connect(owner)
          .setVirtualReserves(newTokenReserve, newEthReserve)
      )
        .to.emit(factory, "VirtualReservesUpdated")
        .withArgs(newTokenReserve, newEthReserve);
    });

    it("Should prevent non-owner from updating virtual reserves", async function () {
      const { factory, user } = await loadFixture(deployFactoryFixture);

      await expect(
        factory
          .connect(user)
          .setVirtualReserves(
            ethers.parseEther("200000"),
            ethers.parseEther("20")
          )
      )
        .to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount")
        .withArgs(await ethers.getAddress(user.address.toLowerCase()));
    });

    it("Should allow owner to update ETH amounts", async function () {
      const { factory, owner } = await loadFixture(deployFactoryFixture);

      const newLiquidity = ethers.parseEther("6");
      const newLiquidityFee = ethers.parseEther("2");
      const newDevReward = ethers.parseEther("2");

      await expect(
        factory
          .connect(owner)
          .setEthAmounts(newLiquidity, newLiquidityFee, newDevReward)
      )
        .to.emit(factory, "EthAmountsUpdated")
        .withArgs(newLiquidity, newLiquidityFee, newDevReward);
    });

    it("Should prevent non-owner from updating ETH amounts", async function () {
      const { factory, user } = await loadFixture(deployFactoryFixture);

      await expect(
        factory
          .connect(user)
          .setEthAmounts(
            ethers.parseEther("6"),
            ethers.parseEther("2"),
            ethers.parseEther("2")
          )
      )
        .to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount")
        .withArgs(await ethers.getAddress(user.address.toLowerCase()));
    });

    it("Should allow owner to update swap fee percentage", async function () {
      const { factory, owner } = await loadFixture(deployFactoryFixture);

      const newFeePercentage = 5;

      await expect(
        factory.connect(owner).setSwapFeePercentage(newFeePercentage)
      )
        .to.emit(factory, "SwapFeePercentageUpdated")
        .withArgs(newFeePercentage);
    });

    it("Should prevent setting swap fee percentage > 100", async function () {
      const { factory, owner } = await loadFixture(deployFactoryFixture);

      await expect(
        factory.connect(owner).setSwapFeePercentage(101)
      ).to.be.revertedWithCustomError(factory, "InvalidPercentage");
    });

    it("Should allow owner to update token total supply", async function () {
      const { factory, owner } = await loadFixture(deployFactoryFixture);

      const newSupply = ethers.parseEther("2000000000");

      await expect(factory.connect(owner).setTokenTotalSupply(newSupply))
        .to.emit(factory, "TokenTotalSupplyUpdated")
        .withArgs(newSupply);
    });

    it("Should prevent non-owner from updating token total supply", async function () {
      const { factory, user } = await loadFixture(deployFactoryFixture);

      await expect(
        factory
          .connect(user)
          .setTokenTotalSupply(ethers.parseEther("2000000000"))
      )
        .to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount")
        .withArgs(await ethers.getAddress(user.address.toLowerCase()));
    });
  });
});
