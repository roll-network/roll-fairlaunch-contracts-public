import { ethers, network, run } from "hardhat";
import fs from "fs";
import path from "path";

export interface DeployConfig {
  create2Salt: string | undefined;
  isUpgradable: boolean;
  key: string;
  name: string;
  params: any[]; // if !undef then use as salt
}

export interface DeployData {
  abi: string;
  address: string;
  contractMeta: DeployConfig;
}

export interface ConfigData {
  [key: string]: DeployData;
}

export const getDeployFileName = (chainId: number) =>
  `deployed/deployments.${chainId}.json`;

export const ensureDirectoryExists = (filePath: string) => {
  const dirname = path.dirname(filePath);
  if (!fs.existsSync(dirname)) {
    fs.mkdirSync(dirname, { recursive: true });
  }
};

export const getCurrentDeployByNetwork = (chainId: number): ConfigData => {
  const fileName = getDeployFileName(chainId);
  ensureDirectoryExists(fileName);

  if (!fs.existsSync(fileName)) {
    // Return empty object if file doesn't exist
    return {};
  }

  try {
    const rawdata = fs.readFileSync(fileName, "utf8");
    return JSON.parse(rawdata);
  } catch (error) {
    console.warn(
      `Warning: Could not read deployment file for network ${network}. Creating new one.`
    );
    return {};
  }
};

export const saveDeployInfo = (deployedData: DeployData) => {
  const chainId = network.config.chainId || 0;
  const fileName = getDeployFileName(chainId);
  ensureDirectoryExists(fileName);

  const prev = getCurrentDeployByNetwork(chainId);
  prev[deployedData.contractMeta.key] = deployedData;

  try {
    fs.writeFileSync(fileName, JSON.stringify(prev, null, 2));
  } catch (error) {
    console.error(
      `Error saving deployment info for network ${network}:`,
      error
    );
    throw error;
  }
};

export const getCurrentDeploy = (
  key: string,
  n: number = network.config.chainId || 0
) => {
  const deployments = getCurrentDeployByNetwork(n);
  return deployments[key];
};
