import { ExecutionConfig, getEnvConfig } from '../config';
import { Driver, TokenContract, Wallet } from '../driver';
import { getExplorerUrl, testUntil, waitForSellSignal } from '../utils';
import fs from 'fs';
import commandLineArgs from 'command-line-args';

const partialExecutionConfig = {
    instaBuy: true,
    gasPrice: 50
};

interface JSONFile {
    inToken: string;
    posiblePairs: string[];
    contract: string;
    wallets: number;
    amountToBuy: number;
    minAmountOut: number;
    enableSellAt: number;
}

const main = async () => {
    const { file } = commandLineArgs([
        { name: 'file', type: String, defaultOption: true }
    ]);
    if (!file) {
        console.error('file was not provided');
        return;
    }

    console.log(`Using file: ${file}`);
    const jsonFile: JSONFile = JSON.parse(
        fs.readFileSync(`contracts/${file}`, 'utf-8')
    );
    const config = getEnvConfig();
    const executionConfig: ExecutionConfig = {
        ...partialExecutionConfig,
        inToken: jsonFile.inToken,
        amountToBuy: jsonFile.amountToBuy,
        minAmountOut: jsonFile.minAmountOut,
        outToken: jsonFile.contract,
        instaBuy: true
    };
    const driver = new Driver(config, executionConfig);
    const mainWallet = await driver.getMainWallet();
    const wallets = [
        mainWallet,
        ...(await driver.getSubWallets(jsonFile.wallets - 1))
    ];

    const pairs = jsonFile.posiblePairs.map((pair) =>
        driver.getTokenContractBySymbol(pair)
    );

    console.log(
        `Running bot to buy ${jsonFile.amountToBuy} ${jsonFile.inToken} of ${jsonFile.contract} using ${jsonFile.wallets} wallets ✅`
    );

    let finalPair: TokenContract = null!;
    finalPair = (await Promise.race(
        pairs.map((pair) =>
            testUntil(async (iteration, cancel) => {
                if (finalPair) {
                    cancel();
                    return;
                }
                const [canBuy, error] = await driver.testSwapTokens(
                    pair,
                    mainWallet
                );
                if (canBuy || finalPair) {
                    return pair;
                } else if (iteration === 1 || iteration % 100 === 0) {
                    console.log(
                        `Tried simulated buy ${iteration} times using ${pair.symbol}, latest error: ${error?.message}`
                    );
                }
            }, 50 * jsonFile.posiblePairs.length)
        )
    )) as TokenContract;

    console.log(
        `Simulated buy was successful for ${finalPair.symbol} pair, attempting real buy 🤞`
    );

    const buyResults = await Promise.allSettled(
        wallets.map(async (wallet, i) => {
            const index = i + 1;
            try {
                console.log(`Wallet ${index} is attempting to buy`);
                const result = await driver.swapTokens(finalPair, wallet, 5);
                console.log(
                    `Wallet ${index} bought! Tx: ${getExplorerUrl(result)} 🤑`
                );
                driver.sendAllTokens;
            } catch (err: any) {
                console.error(
                    `Wallet ${index} failed to buy, error: ${err?.message} 😨`
                );
                throw err;
            }
            try {
                const isTokenApproved = await driver.isTokenApproved(
                    driver.getOutTokenContract(),
                    wallet
                );
                if (!isTokenApproved) {
                    console.log(`Wallet ${index} is approving token for sell`);
                    await driver.approveTokens(
                        driver.getOutTokenContract(),
                        wallet
                    );
                    console.log(`Wallet ${index} is ready to sell! 🤟`);
                }
            } catch (err: any) {
                console.error(
                    `Wallet ${index} failed to approve tokens, error: ${err?.message} 🤨`
                );
                throw err;
            }
        })
    );

    const walletsToSell = buyResults
        .map((result, i) => (result.status === 'fulfilled' ? wallets[i] : null))
        .filter((wallet) => wallet) as Wallet[];

    if (walletsToSell.length === 0) {
        console.log(`Buy attemp failed for all wallets 😭`);
    }

    console.log(`Buy Successful for ${walletsToSell.length} wallets 🤑`);

    console.log(
        `Attemping simulated sell until capable of selling for at least ${jsonFile.enableSellAt}x profit 🤞`
    );

    let sellFlag = false;
    sellFlag = (await testUntil(async (iteration) => {
        const [canSell, error] = await driver.testSell(
            finalPair,
            walletsToSell[0],
            jsonFile.amountToBuy * jsonFile.enableSellAt
        );
        if (canSell || sellFlag) {
            return true;
        } else if (iteration === 1 || iteration % 100 === 0) {
            console.log(
                `Tried to sell ${iteration} times, latest error: ${error?.message}`
            );
        }
    }, 100)) as boolean;

    console.log(`All ready to sell, pull the trigger by typing "sell" 🚀🚀🚀`);

    await waitForSellSignal();

    const sellResults = await Promise.allSettled(
        wallets.map(async (wallet, i) => {
            const index = i + 1;
            try {
                console.log(`Wallet ${index} is attempting to sell 🤑🤑🤑`);
                const result = await driver.sell(finalPair, wallet, 6);
                console.log(
                    `Wallet ${index} sold! Tx: ${getExplorerUrl(result)}`
                );
                driver.sendAllTokens;
            } catch (err: any) {
                console.error(
                    `Wallet ${index} failed to sell, error: ${err?.message} 🤡`
                );
                throw err;
            }
        })
    );

    const soldWallets = sellResults
        .map((result, i) => (result.status === 'fulfilled' ? wallets[i] : null))
        .filter((wallet) => wallet) as Wallet[];

    console.log(`Sell Successful for ${soldWallets.length} wallets 💵💵💵`);

    console.log('WE ARE DONE BOYS! 🥳🥳🥳');
};

main();
