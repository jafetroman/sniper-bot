import { ExecutionConfig, getEnvConfig } from '../config';
import { Driver } from '../driver';
import { TelegramDriver } from '../telegramDriver';
import { getExplorerUrl, sleep, testUntil } from '../utils';

const executionConfig: ExecutionConfig = {
    inToken: 'BUSD',
    instaBuy: true,
    telegramChannel: '702777548',
    amountToBuy: 5,
    minAmountOut: 0.38,
    gasPrice: 5
};

const subWalletsCount = 2;

const main = async () => {
    const config = getEnvConfig();
    const driver = new Driver(config, executionConfig);
    const telegramDriver = await TelegramDriver.create(config, executionConfig);
    await telegramDriver.getChannels();
    const subWallets = await driver.getSubWallets(subWalletsCount);

    console.log('Waiting for contract');
    const { address, pair } = await telegramDriver.getTokenAndPair();
    driver.setOutTokenAddress(address);
    console.log('Contract address is: ' + address);

    const pairTokenContract = driver.getTokenContractBySymbol(
        pair || executionConfig.inToken
    );

    await Promise.all(
        subWallets.map(async (subWallet, i) => {
            try {
                try {
                    console.log('Sub wallet ' + i + ' is attenting to buy');
                    const result = await driver.swapTokens(
                        pairTokenContract,
                        subWallet,
                        5
                    );
                    console.log('Sub wallet ' + i + ' bought!');
                    console.log(getExplorerUrl(result));
                } catch (err) {
                    console.log(
                        'Sub wallet ' + i + ' buy failed, started testing...'
                    );
                    await testUntil(
                        () =>
                            driver.testSwapTokens(pairTokenContract, subWallet),
                        100
                    );
                    console.log('Test passed buying again');
                    console.log(
                        'Sub wallet ' + i + ' is attenting to buy [FROM TEST]'
                    );
                    const result = await driver.swapTokens(
                        pairTokenContract,
                        subWallet,
                        5
                    );
                    console.log('Sub wallet ' + i + ' bought!');
                    console.log(getExplorerUrl(result));
                }
            } catch (err) {
                console.error('Error in subwallet ' + i);
                console.error(err);
            }
        })
    );

    console.log('PROCESS COMPLETED!');
};

main();
