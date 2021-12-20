import { ethers } from 'ethers';
import { Config } from './config';
import erc20Abi from './erc20Abi';

export class Driver {
    private provider: ethers.providers.JsonRpcProvider;
    private hdNode: ethers.utils.HDNode;
    private masterWallet: ethers.Wallet;
    private routerContract: ethers.Contract;
    private factoryContract: ethers.Contract;
    private inTokenContract: ethers.Contract;
    private outTokenContract: ethers.Contract;

    constructor(config: Config) {
        const isWssServer = config.server.startsWith('wss://');

        this.provider = isWssServer
            ? new ethers.providers.WebSocketProvider(config.server)
            : new ethers.providers.JsonRpcProvider(config.server);

        this.hdNode = ethers.utils.HDNode.fromMnemonic(config.keys);

        this.masterWallet = new ethers.Wallet(
            this.hdNode.derivePath(`m/44'/60'/0'/0/0`)
        ).connect(this.provider);

        this.routerContract = new ethers.Contract(config.router, [
            'function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)',
            'function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
            'function swapExactTokensForTokensSupportingFeeOnTransferTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
            'function swapETHForExactTokens(uint amountOut, address[] calldata path, address to, uint deadline) external  payable returns (uint[] memory amounts)',
            'function swapExactETHForTokens( uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)'
        ]);

        this.factoryContract = new ethers.Contract(config.factory, [
            'event PairCreated(address indexed token0, address indexed token1, address pair, uint)',
            'function getPair(address tokenA, address tokenB) external view returns (address pair)'
        ]);

        this.inTokenContract = new ethers.Contract(config.inToken, erc20Abi);

        this.outTokenContract = new ethers.Contract(config.outToken, erc20Abi);
    }

    public getSubWallets = (limit: number) => {
        return Array.from({ length: limit }, (_, i) =>
            new ethers.Wallet(
                this.hdNode.derivePath(`m/44'/60'/0'/0/${i + 1}`)
            ).connect(this.provider)
        );
    };

    public sendFunds = async (
        from: ethers.Wallet,
        to: ethers.Wallet,
        amount: ethers.BigNumber,
        nonce?: number
    ) => {
        const transaction = await from.sendTransaction({
            to: await to.getAddress(),
            value: amount,
            gasPrice: ethers.utils.parseUnits('5', 'gwei'),
            gasLimit: 21000,
            nonce
        });
        return transaction.wait();
    };

    public sendAllFunds = async (
        from: ethers.Wallet,
        to: ethers.Wallet,
        nonce?: number
    ) => {
        const balance = await from.getBalance();
        const requiredForGas = ethers.utils.parseUnits('5', 'gwei').mul(21000);
        const transactionValue = balance.sub(requiredForGas);
        if (transactionValue.lt(1)) {
            return;
        }
        const transaction = await from.sendTransaction({
            to: await to.getAddress(),
            value: transactionValue,
            gasPrice: ethers.utils.parseUnits('5', 'gwei'),
            gasLimit: 21000,
            nonce
        });
        return transaction.wait();
    };

    public sendTokens = async (
        contract: ethers.Contract,
        from: ethers.Wallet,
        to: ethers.Wallet,
        amount: ethers.BigNumber,
        nonce?: number
    ) => {
        const transaction = contract
            .connect(from)
            .transfer(await to.getAddress(), amount, {
                gasPrice: 5,
                nonce
            });
        return transaction.wait();
    };

    public sendAllTokens = async (
        contract: ethers.Contract,
        from: ethers.Wallet,
        to: ethers.Wallet,
        nonce?: number
    ) => {
        const balance: ethers.BigNumber = await contract.balanceOf(
            await from.getAddress()
        );
        const transaction = contract
            .connect(from)
            .transfer(await to.getAddress(), balance, {
                gasPrice: 5,
                nonce
            });
        return transaction.wait();
    };
}
