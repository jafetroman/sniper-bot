import { ExecutionConfig, getEnvConfig } from '../config';
import { Driver, TokenContract } from '../driver';
import { getExplorerUrl, testUntil } from '../utils';

const partialExecutionConfig = {
    instaBuy: true,
    outToken: '0xfa57ff4670f9016069e799A51a3186d03991E431',
    gasPrice: 50
};

const jsonConfig = {
    inToken: 'WBNB',
    posiblePairs: ['WBNB', 'BUSD', 'USDT'],
    contract: '',
    wallets: 2,
    amountToBuy: 397,
    minAmountOut: 2000
};

const main = async () => {
    const config = getEnvConfig();
    const executionConfig: ExecutionConfig = {
        ...partialExecutionConfig,
        inToken: jsonConfig.inToken,
        amountToBuy: jsonConfig.amountToBuy,
        minAmountOut: jsonConfig.minAmountOut,
        instaBuy: true
    };
    const driver = new Driver(config, executionConfig);
    const mainWallet = await driver.getMainWallet();
    const wallets = [
        mainWallet,
        ...(await driver.getSubWallets(jsonConfig.wallets - 1))
    ];

    const pairs = jsonConfig.posiblePairs.map((pair) =>
        driver.getTokenContractBySymbol(pair)
    );

    console.log(
        `Running bot to buy ${jsonConfig.amountToBuy} ${jsonConfig.inToken} of ${jsonConfig.contract} using ${jsonConfig.wallets} wallets`
    );

    const finalPair = (await Promise.race(
        pairs.map((pair) =>
            testUntil(async (iteration) => {
                const [canBuy, error] = await driver.testSwapTokens(
                    pair,
                    mainWallet
                );
                if (canBuy) {
                    return pair;
                } else if (iteration === 1 || iteration % 100 === 0) {
                    console.log(
                        `Tried to buy ${iteration} times using ${pair.symbol}, latest error: ${error?.message}`
                    );
                }
            }, 50 * jsonConfig.posiblePairs.length)
        )
    )) as TokenContract;

    console.log(
        `Simulated buy was successful for ${finalPair.symbol} pair, attempting real buy`
    );

    const results = await Promise.allSettled(
        wallets.map(async (wallet, i) => {
            const index = i + 1;
            try {
                console.log(`Wallet ${index} is attempting to buy`);
                const result = await driver.swapTokens(finalPair, wallet, 50);
                console.log(
                    `Wallet ${index} bought! Tx: ${getExplorerUrl(result)}`
                );
            } catch (err: any) {
                console.error(
                    `Wallet ${index} failed to buy, error: ${err?.message}`
                );
                throw err;
            }
            try {
                console.log(`Wallet ${index} is approving token for sale`);
                await driver.approveTokens(
                    driver.getOutTokenContract(),
                    wallet
                );
                console.log(`Wallet ${index} is ready to sell!`);
            } catch (err: any) {
                console.error(
                    `Wallet ${index} failed to approve tokens, error: ${err?.message}`
                );
                throw err;
            }
        })
    );

    console.log(
        `Buy Successful for ${
            results.filter((result) => result.status === 'fulfilled').length
        } wallets`
    );
    console.log('PROCESS COMPLETED');
};

main();
