# Test

Run test:

```shell
npx hardhat test
```

# Run localhost

To run on localhost you should first start local node and then deploy to it

```shell
npx hardhat node
npx hardhat run deployment/deploy-dev.ts --network localhost
```

# Deploy

Deploy to any network is the same. After each deploy you can find the Json file with the Abi and address information.
Be sure you set the right values on .env

```shell
npx hardhat run deployment/deploy-dev.ts --network formtestnet
```

To check script running on forking environment: 
(do not forget to configure formtestnet as forking environment on hardhat network in config)
```shell
npx hardhat run deployment/deploy-dev.ts --network hardhat
```


Prod:

```shell
npx hardhat run deployment/deploy-prod.ts --network formmainnet
```

Latest form mainet deployment:
https://formapi.0xgraph.xyz/api/public/3ca14bd1-ed61-4a4c-8f53-c1a39e57a6e8/subgraphs/SHAPESV3/v0.0.1/gn

