import { network } from "hardhat";

import { deployContracts, postDeploy } from "./deploy";
import { Addr, FeesHandler } from "./config";
import { CHAIN_IDS, getChainSpecificFeeSetter } from "./pumpFactory.config";

const main = async () => {
  if (!["formmainnet"].includes(network.name) || !network.config.chainId)
    throw Error(`Wrong network, you are in ${network.name}`);

  console.log("network.name", network.name);
  console.log("network.config.chainId", network.config.chainId);

  const feesHandler: FeesHandler = {
    feeRecipientSetter: getChainSpecificFeeSetter(CHAIN_IDS.FORM_MAINNET) as Addr,
    feeRecipient: getChainSpecificFeeSetter(CHAIN_IDS.FORM_MAINNET) as Addr,
  };

  await deployContracts(feesHandler);

  const newOwner = feesHandler.feeRecipient;
  await postDeploy(newOwner);
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
