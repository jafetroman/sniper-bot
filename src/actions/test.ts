import { isCommunityResourcable } from '@ethersproject/providers';
import { ExecutionConfig, getEnvConfig } from '../config';
import { Driver } from '../driver';
import { TelegramDriver } from '../telegramDriver';
import { getExplorerUrl } from '../utils';

const executionConfig: ExecutionConfig = {
    inToken: 'WBNB',
    instaBuy: false,
    telegramChannel: '702777548',
    amountToBuy: 0.01,
    minAmountOut: 0.2,
    gasPrice: 5
};

const main = async () => {
    const config = getEnvConfig();
    const driver = new Driver(config, executionConfig);
    const telegramDriver = await TelegramDriver.create(config, executionConfig);
    const mainWallet = await driver.getMainWallet();

    const { address, pair } = await telegramDriver.getTokenAndPair();
    driver.setOutTokenAddress(address);

    const pairTokenContract = driver.getTokenContractBySymbol(
        pair || executionConfig.inToken
    );

    const result = await driver.swapTokens(pairTokenContract, mainWallet, 5);
    console.log(getExplorerUrl(result));
};

main();
