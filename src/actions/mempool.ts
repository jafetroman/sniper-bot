import { ethers } from 'ethers';
import { ROUTER_ABI } from '../abis';

const url =
    'wss://speedy-nodes-nyc.moralis.io/dce631a82794e22474dab5bb/bsc/mainnet/ws';

const init = function () {
    const customWsProvider = new ethers.providers.WebSocketProvider(url);

    const inter = new ethers.utils.Interface(ROUTER_ABI);

    customWsProvider.on('pending', (tx) => {
        customWsProvider.getTransaction(tx).then((transaction) => {
            console.log();
            if (
                transaction.to === '0x10ED43C718714eb63d5aA57B78B54704E256024E'
            ) {
                const decodedInput = inter.parseTransaction({
                    data: transaction.data,
                    value: transaction.value
                });
                console.log(transaction);
                console.log(decodedInput);
            }
        });
    });

    customWsProvider._websocket.on('error', async () => {
        console.log(`Unable to connect, retrying in 3s...`);
    });
    customWsProvider._websocket.on('close', async () => {
        console.log(`Connection lost with Attempting reconnect in 3s...`);
        customWsProvider._websocket.terminate();
    });
};

init();
