
// import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
dotenv.config({ path: __dirname + "/.env" });

import "@typechain/hardhat";
import "@nomicfoundation/hardhat-ethers";
import "hardhat-preprocessor";
import "hardhat-contract-sizer";
import "hardhat-gas-reporter";
import "@nomicfoundation/hardhat-verify";
import "solidity-coverage";

import { HashZero } from "@ethersproject/constants";
if (process.env.DOCKER) {
  require("hardhat-ethernal");
}
import { removeConsoleLog } from "hardhat-preprocessor";

import { getHardhatConfigNetworks } from "./hardhat.config.networks";
import { getHardhatConfigScanners } from "./hardhat.config.scanners";

const PRIVATE_KEY = `${process.env.PRIVATE_KEY || HashZero.slice(2)}`;

const config = {
  contractSizer: {
    alphaSort: true,
    disambiguatePaths: false,
    runOnCompile: true,
  },
  etherscan: {
    ...getHardhatConfigScanners(),
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    customChains: [
      {
        chainId: 478,
        network: "formmainnet",
        urls: {
          apiURL: "https://explorer.form.network/api",
          browserURL: "https://explorer.form.network",
        },
      },
      {
        chainId: 132902,
        network: "formtestnet",
        urls: {
          apiURL: "https://sepolia-explorer.form.network/api",
          browserURL: "https://sepolia-explorer.form.network",
        },
      },
    ],
  },
  networks: {
    ...getHardhatConfigNetworks([`0x${PRIVATE_KEY}`]),

  },
  preprocess: {
    eachLine: removeConsoleLog((hre: { network: { name: string } }) => {
      return hre.network.name !== "hardhat" && hre.network.name !== "localhost";
    }),
  },

  solidity: {
    compilers: [
      {
        settings: {
          optimizer: { enabled: true, runs: 200 },
          viaIR: true, // Enable IR pipeline
        },
        version: "0.8.20",
      },
      {
        settings: {
          optimizer: { enabled: true, runs: 200 },
        },
        version: "0.8.15",
      },
      {
        settings: {},
        version: "0.5.15",
      },
    ],
    settings: {
      optimizer: {
        enabled: true,
        runs: 1000,
      },
    },
  },

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  typechain: {
    outDir: "typechain-types",
  },
};

export default config;