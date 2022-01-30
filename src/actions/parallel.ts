import { ExecutionConfig, getEnvConfig } from '../config';
import { Driver, TokenContract } from '../driver';
import { getExplorerUrl, testUntil } from '../utils';

const executionConfig: ExecutionConfig = {
    inToken: 'BUSD',
    instaBuy: true,
    outToken: '0xfa57ff4670f9016069e799A51a3186d03991E431',
    amountToBuy: 397,
    minAmountOut: 2000,
    gasPrice: 50
};

const main = async () => {
    const config = getEnvConfig();
    const driver = new Driver(config, executionConfig);
    const wallet = await driver.getMainWallet();

    console.log('Testing with subwallet 1');
    const pair = (await testUntil(async () => {
        const promise1 = driver.testSwapTokens(
            driver.getInTokenContract(),
            wallet
        );
        const promise2 = driver.testSwapTokens(
            driver.getTokenContractBySymbol('WBNB'),
            wallet
        );
        if (await promise1) {
            return driver.getInTokenContract();
        }
        if (await promise2) {
            return driver.getTokenContractBySymbol('WBNB');
        }
    }, 150)) as TokenContract;
    console.log('LIQUIDITY FOUND!!!!!!');

    try {
        console.log('Sub wallet is attenting to buy');
        const result = await driver.swapTokens(pair, wallet, 50);
        console.log('Sub wallet bought!');
        console.log(getExplorerUrl(result));
    } catch (err) {
        console.error('Error in subwallet');
        console.error(err);
    }

    console.log('PROCESS COMPLETED!');
};

main();
