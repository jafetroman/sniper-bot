import { ethers } from 'ethers';
import { getEnvConfig } from '../config';
import { Driver } from '../driver';

const subWalletsCount = 8;
const ammount = ethers.utils.parseUnits('0.02', 18);

const main = async () => {
    const config = getEnvConfig();
    const driver = new Driver(config);
    const mainWallet = await driver.getMainWallet();
    const subWallets = await driver.getSubWallets(subWalletsCount);
    const transactionCount = await mainWallet.wallet.getTransactionCount();
    await Promise.all(
        subWallets.map(async (subWallet, i) => {
            console.log(`Sub wallet ${i}: Sending to wallet`);
            await driver.sendFunds(
                mainWallet,
                subWallet,
                ammount,
                transactionCount + i
            );
            console.log(`Sub wallet ${i}: Send successful`);
        })
    );
    console.log('Process complete!');
};

main();
