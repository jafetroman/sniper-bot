import { ethers } from 'ethers';
import { getEnvConfig } from '../config';
import { Driver } from '../driver';

const subWalletsCount = 8;
const ammount = ethers.utils.parseUnits('732.5', 18);
const tokenSymbol = 'BUSD';

//TODO only send the difference

const main = async () => {
    const config = getEnvConfig();
    const driver = new Driver(config);
    const tokenContract = await driver.getTokenContractBySymbol(tokenSymbol);
    const mainWallet = await driver.getMainWallet();
    const subWallets = await driver.getSubWallets(subWalletsCount);
    const transactionCount = await mainWallet.wallet.getTransactionCount();
    await Promise.all(
        subWallets.map(async (subWallet, i) => {
            console.log(`Sub wallet ${i}: Sending to wallet`);
            await driver.sendTokens(
                tokenContract,
                mainWallet,
                subWallet,
                ammount,
                transactionCount + i
            );
            console.log(`Sub wallet ${i}: Send successful`);

            const isApproved = await driver.isTokenApproved(
                tokenContract,
                subWallet
            );
            if (!isApproved) {
                console.log(`Sub wallet ${i}: Approving token`);
                await driver.approveTokens(tokenContract, subWallet);
                console.log(`Sub wallet ${i}: Token approved`);
            } else {
                console.log(`Sub wallet ${i}: Was already approved`);
            }
        })
    );
    console.log('Process complete!');
};

main();
