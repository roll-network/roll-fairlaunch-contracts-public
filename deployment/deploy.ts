import { ethers, run, network } from "hardhat";

import { ContractsKeys, deployConfigMap, FeesHandler } from "./config";
import {
  getCurrentDeploy,
  getCurrentDeployByNetwork,
  saveDeployInfo,
} from "./tools";
import { getChainSpecificPumpFactoryConfig } from "./pumpFactory.config";
import { PumpFactory } from "@typechain-types";

const verifyContract = async (
  contractAddress: string,
  constructorArguments: any[]
) => {
  // Verification process
  console.log(`Verifying contract ${contractAddress}`);
  try {
    await run("verify:verify", {
      address: contractAddress,
      constructorArguments,
    });
    console.log("Verification successful");
  } catch (error) {
    console.error("Verification failed:", error);
  }
};

const getDeploy = async (
  key: ContractsKeys,
  deploy: boolean,
  params: any[]
) => {
  return getCurrentDeploy(key);
};

const getContract = async (key: ContractsKeys) => {
  const data = await getDeploy(key, false, []);
  if (!data || !data.contractMeta) {
    throw new Error("Could not find deployment");
  }

  const factory = await ethers.getContractFactory(data.contractMeta.key);
  const contract = await factory.attach(data.address);
  return contract;
};

const deployShapes = async (feesHandler: FeesHandler): Promise<string> => {
  {
    const chainId = network.config.chainId || 0;
    const config = getChainSpecificPumpFactoryConfig(
      chainId,
      feesHandler.feeRecipient,
      feesHandler.feeRecipientSetter
    );

    console.log("Deploying PumpFactory...");
    console.log("Configuration:");
    console.log("- Token Total Supply:", config.tokenTotalSupply);
    console.log(
      "- Token Creation Fee:",
      ethers.formatEther(config.tokenCreationFee)
    );
    console.log("- Swap Fee Percentage:", config.swapFeePercentage);
    console.log(
      "- Virtual Token Reserve:",
      ethers.formatEther(config.virtualTokenReserve)
    );
    console.log(
      "- Virtual ETH Reserve:",
      ethers.formatEther(config.virtualEthReserve)
    );
    console.log(
      "- ETH Amount For Liquidity:",
      ethers.formatEther(config.ethAmountForLiquidity)
    );
    console.log(
      "- ETH Amount For Liquidity Fee:",
      ethers.formatEther(config.ethAmountForLiquidityFee)
    );
    console.log(
      "- ETH Amount For Dev Reward:",
      ethers.formatEther(config.ethAmountForDevReward)
    );
    console.log("- Fee Recipient:", config.feeRecipient);
    console.log("- Fee Recipient Setter:", config.feeRecipientSetter);
    console.log("- WETH:", config.WETH);
    console.log("- Algebra Factory:", config.ALGEBRA_FACTORY);
    console.log("- Algebra Position Manager:", config.ALGEBRA_POSITION_MANAGER);

    const PumpFactory = await ethers.getContractFactory("PumpFactory");

    const pumpFactory = await PumpFactory.deploy(
      config.tokenTotalSupply,
      config.tokenCreationFee,
      config.swapFeePercentage,
      config.virtualTokenReserve,
      config.virtualEthReserve,
      config.ethAmountForLiquidity,
      config.ethAmountForLiquidityFee,
      config.ethAmountForDevReward,
      config.feeRecipient,
      config.feeRecipientSetter,
      config.WETH,
      config.ALGEBRA_FACTORY,
      config.ALGEBRA_POSITION_MANAGER
    );

    const contract = await pumpFactory.waitForDeployment();

    const pumpFactoryAddress = await pumpFactory.getAddress();
    console.log("PumpFactory deployed to:", pumpFactoryAddress);
    
    await verifyContract(pumpFactoryAddress, [
      config.tokenTotalSupply,
      config.tokenCreationFee,
      config.swapFeePercentage,
      config.virtualTokenReserve,
      config.virtualEthReserve,
      config.ethAmountForLiquidity,
      config.ethAmountForLiquidityFee,
      config.ethAmountForDevReward,
      config.feeRecipient,
      config.feeRecipientSetter,
      config.WETH,
      config.ALGEBRA_FACTORY,
      config.ALGEBRA_POSITION_MANAGER,
    ]);

    const abi = contract.interface.formatJson();
    const data = {
      abi: JSON.parse(abi),
      address: pumpFactoryAddress,
      contractMeta: {
        key: "PumpFactory",
      },
    };
    saveDeployInfo(data as any);
  }
  return "";
};

export const deployContracts = async (
  feesHandler: FeesHandler
): Promise<string> => {
  const chainId = network.config.chainId || 0;
  await deployShapes(feesHandler);
  console.log("all contracts successfully deployed");
  return "";
};

export const postDeploy = async (newOwner: string) => {
  {
    const chainId = network.config.chainId || 0;
    console.log("current deployment", getCurrentDeployByNetwork(chainId));
    const pumpFactory: PumpFactory = (await getContract(
      ContractsKeys.PumpFactory
    )) as PumpFactory;

    console.log("ownership is transferring to: ", newOwner);
    const ownershipTransferredTx = await pumpFactory.transferOwnership(
      newOwner
    );
    await ownershipTransferredTx.wait();
    console.log(
      "ownership transferred to: ",
      newOwner,
      " with tx hash: ",
      ownershipTransferredTx.hash
    );
  }
  console.log("post deploy routine done");
};
