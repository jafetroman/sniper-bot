import { ethers } from 'ethers';
import { getEnvConfig } from '../config';
import { Driver } from '../driver';

const subWalletsCount = 4;
const tokenSymbol = 'BUSD';

const main = async () => {
    const config = getEnvConfig();
    const driver = new Driver(config);
    const tokenContract = await driver.getTokenContractBySymbol(tokenSymbol);
    const subWallets = await driver.getSubWallets(subWalletsCount);
    await Promise.all(
        subWallets.map(async (subWallet, i) => {
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
