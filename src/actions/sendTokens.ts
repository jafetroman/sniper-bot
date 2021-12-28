import { ethers } from 'ethers';
import { getEnvConfig } from '../config';
import { Driver } from '../driver';

const subWalletsCount = 1;
const ammount = ethers.utils.parseUnits('5', 18);
const tokenSymbol = 'BUSD';

const main = async () => {
    const config = getEnvConfig();
    const driver = new Driver(config);
    const tokenContract = await driver.getTokenContractBySymbol(tokenSymbol);
    const mainWallet = await driver.getMainWallet();
    const subWallets = await driver.getSubWallets(subWalletsCount);
    await Promise.all(
        subWallets.map(async (subWallet, i) => {
            console.log(`Sub wallet ${i}: Sending to wallet`);
            await driver.sendTokens(
                tokenContract,
                mainWallet,
                subWallet,
                ammount
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
            }
        })
    );
    console.log('Process complete!');
};

main();
