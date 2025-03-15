import { ethers } from "hardhat";
import { Addr } from "./config";

export const CHAIN_IDS = {
  FORM_MAINNET: 478,
  FORM_TESTNET: 132902,
  LOCALHOST: 31337,
};

interface NetworkConfig {
  WETH: Addr;
  ALGEBRA_FACTORY: Addr;
  ALGEBRA_POSITION_MANAGER: Addr;
}

export interface PumpFactoryDeploymentConfig {
  tokenTotalSupply: string;
  tokenCreationFee: string;
  swapFeePercentage: string;
  virtualTokenReserve: string;
  virtualEthReserve: string;
  ethAmountForLiquidity: string;
  ethAmountForLiquidityFee: string;
  ethAmountForDevReward: string;
  feeRecipient: Addr;
  feeRecipientSetter: Addr;
  WETH: string;
  ALGEBRA_FACTORY: string;
  ALGEBRA_POSITION_MANAGER: string;
}

const chainConfigs: { [key: number]: NetworkConfig } = {
  [CHAIN_IDS.FORM_MAINNET]: {
    WETH: ethers.getAddress(
      "0xb1b812b664c28E1bA1d35De925Ae88b7Bc7cdCF5".toString()
    ) as Addr,
    ALGEBRA_FACTORY: ethers.getAddress(
      "0xbd799BE84dd34B1242e1f7736A6441d6b1540e8b".toString()
    ) as Addr,
    ALGEBRA_POSITION_MANAGER: ethers.getAddress(
      "0x3FE6BA6D9aBeBb6d853891b2bda8C4A59C688457".toString()
    ) as Addr,
  },
  [CHAIN_IDS.FORM_TESTNET]: {
    WETH: ethers.getAddress(
      "0xA65be6D7DE4A82Cc9638FB3Dbf8E68b7f2e757ab".toString()
    ) as Addr,
    ALGEBRA_FACTORY: ethers.getAddress(
      "0x27951C7F8b609C0bb9c42e3988916d5E3ae0aC22".toString()
    ) as Addr,
    ALGEBRA_POSITION_MANAGER: ethers.getAddress(
      "0x19977d64d965C4763f9AF89C9dA34558B7b328D6".toString()
    ) as Addr,
  },
};

const DEFAULT_CONFIG: NetworkConfig = chainConfigs[CHAIN_IDS.FORM_TESTNET];

export function getNetworkConfig(chainId?: number): NetworkConfig {
  if (!chainId) return DEFAULT_CONFIG;
  return chainConfigs[chainId] || DEFAULT_CONFIG;
}

const tokenTotalSupply = 1 * 10 ** 9;
const tokenCreationFee = ethers.parseEther("0.00001");
const swapFeePercentage = "1";
const virtualTokenReserve = ethers.parseEther(tokenTotalSupply.toString());
const ethAmountForLiquidity = ethers.parseEther("4");
const ethAmountForLiquidityFee = ethers.parseEther("0.1");
const ethAmountForDevReward = ethers.parseEther("0.1");

const totalEthReserveAtMigration =
  ethAmountForLiquidity + ethAmountForLiquidityFee + ethAmountForDevReward;

const totalTokenReserveAtMigration = ethers.parseEther(
  (0.2 * tokenTotalSupply).toString()
); // 20% of total supply left in pool

const virtualEthReserve =
  (totalTokenReserveAtMigration * totalEthReserveAtMigration) /
  (virtualTokenReserve - totalTokenReserveAtMigration);

// Default configuration that remains same across networks
const commonConfig = {
  tokenTotalSupply: tokenTotalSupply.toString(), // 1B tokens
  tokenCreationFee: tokenCreationFee.toString(),
  swapFeePercentage: swapFeePercentage,
  virtualTokenReserve: virtualTokenReserve.toString(),
  virtualEthReserve: virtualEthReserve.toString(),
  ethAmountForLiquidity: ethAmountForLiquidity.toString(),
  ethAmountForLiquidityFee: ethAmountForLiquidityFee.toString(),
  ethAmountForDevReward: ethAmountForDevReward.toString(),
};

export const getChainSpecificPumpFactoryConfig = (
  chainId: number,
  feeRecipient: Addr,
  feeRecipientSetter: Addr
): PumpFactoryDeploymentConfig => {
  const chainSpecificConfig = getNetworkConfig(chainId);
  if (!chainSpecificConfig) {
    throw new Error("Does not contain chain specific configurations");
  }
  return {
    tokenTotalSupply: commonConfig.tokenTotalSupply, // 1B tokens
    tokenCreationFee: commonConfig.tokenCreationFee,
    swapFeePercentage: commonConfig.swapFeePercentage,
    virtualTokenReserve: commonConfig.virtualTokenReserve,
    virtualEthReserve: commonConfig.virtualEthReserve,
    ethAmountForLiquidity: commonConfig.ethAmountForLiquidity,
    ethAmountForLiquidityFee: commonConfig.ethAmountForLiquidityFee,
    ethAmountForDevReward: commonConfig.ethAmountForDevReward,

    feeRecipient: feeRecipient,
    feeRecipientSetter: feeRecipientSetter,

    WETH: chainSpecificConfig.WETH,
    ALGEBRA_FACTORY: chainSpecificConfig.ALGEBRA_FACTORY,
    ALGEBRA_POSITION_MANAGER: chainSpecificConfig.ALGEBRA_POSITION_MANAGER,
  };
};

// export const FEE_SETTER = ethers.getAddress(
//   "0x4e93F5876304CF9D8374A77BCEDB7680d5A9D14e".toLowerCase()
// );


export const FEE_SETTER_FORM_MAINNET = ethers.getAddress(
    "0x4e93F5876304CF9D8374A77BCEDB7680d5A9D14e".toLowerCase()
);

export const FEE_SETTER_FORM_TESTNET = ethers.getAddress(
    "0xc05ed3743D87Bee34b76792d28347478015D7754".toLowerCase()
);
  

export const getChainSpecificFeeSetter = (
    chainId: number,
  ): string => {
    if (chainId === CHAIN_IDS.FORM_MAINNET) {
      return FEE_SETTER_FORM_MAINNET;
    } else if (chainId === CHAIN_IDS.FORM_TESTNET) {
      return FEE_SETTER_FORM_TESTNET;
    }
  return FEE_SETTER_FORM_TESTNET;
};

