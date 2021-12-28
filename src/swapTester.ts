import Web3 from 'web3';
import { ROUTER_ABI } from './abis';
import { EnvConfig } from './config';
import { Contract } from 'web3-eth-contract';

export class SwapTester {
    private routerContract: Contract;

    constructor(config: EnvConfig) {
        const network = config.network;
        const isWssServer = network.server.startsWith('wss://');

        const provider = isWssServer
            ? new Web3.providers.WebsocketProvider(network.server)
            : new Web3.providers.HttpProvider(network.server);

        const web3 = new Web3(provider);
        this.routerContract = new web3.eth.Contract(ROUTER_ABI, network.router);
    }

    public testSwapTokens = async (
        amountToBuy: string,
        minAmountOut: string,
        path: string[],
        from: string
    ) => {
        try {
            await this.routerContract.methods
                .swapExactTokensForTokens(
                    amountToBuy,
                    minAmountOut,
                    path,
                    from,
                    Date.now() + 1000 * 60 * 5
                )
                .call({ from });
            return true;
        } catch (err) {
            return false;
        }
    };
}
