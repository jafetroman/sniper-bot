import { ethers } from 'ethers';
import { Config } from './config';
import erc20Abi from './erc20Abi';

export interface Wallet {
    wallet: ethers.Wallet;
    address: string;
}

export class Driver {
    private provider: ethers.providers.JsonRpcProvider;
    private hdNode: ethers.utils.HDNode;
    private mainWallet: ethers.Wallet;
    private routerContract: ethers.Contract;
    private factoryContract: ethers.Contract;

    private inTokenAddress: string;
    private outTokenAddress: string = null!;
    private inTokenContract: ethers.Contract;
    private outTokenContract: ethers.Contract = null!;

    private amountToBuy: ethers.BigNumber;

    constructor(private config: Config) {
        const isWssServer = config.server.startsWith('wss://');

        this.provider = isWssServer
            ? new ethers.providers.WebSocketProvider(config.server)
            : new ethers.providers.JsonRpcProvider(config.server);

        this.hdNode = ethers.utils.HDNode.fromMnemonic(config.keys);

        this.mainWallet = new ethers.Wallet(
            this.hdNode.derivePath(`m/44'/60'/0'/0/0`)
        ).connect(this.provider);

        this.routerContract = new ethers.Contract(config.router, [
            'function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)',
            'function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
            'function swapExactTokensForTokensSupportingFeeOnTransferTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
            'function swapETHForExactTokens(uint amountOut, address[] calldata path, address to, uint deadline) external  payable returns (uint[] memory amounts)',
            'function swapExactETHForTokens( uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)'
        ]).connect(this.mainWallet);

        this.factoryContract = new ethers.Contract(config.factory, [
            'event PairCreated(address indexed token0, address indexed token1, address pair, uint)',
            'function getPair(address tokenA, address tokenB) external view returns (address pair)'
        ]).connect(this.mainWallet);

        this.inTokenAddress = config.inToken;
        this.inTokenContract = new ethers.Contract(
            this.inTokenAddress,
            erc20Abi
        ).connect(this.mainWallet);
        if (config.outToken) {
            this.outTokenAddress = config.outToken;
            this.outTokenContract = new ethers.Contract(
                this.outTokenAddress,
                erc20Abi
            ).connect(this.mainWallet);
        }

        this.amountToBuy = ethers.utils.parseUnits(
            config.amountToBuy.toFixed(8),
            config.inTokenDecimals
        );
    }

    public asyncInit = () => {};

    public setOutTokenAddress = (address: string) => {
        this.outTokenAddress = address;
        this.outTokenContract = new ethers.Contract(
            this.outTokenAddress,
            erc20Abi
        ).connect(this.mainWallet);
    };

    public getInTokenContract = () => this.inTokenContract;

    public getOutTokenContract = () => this.outTokenContract;

    public getMainWallet = async () => ({
        wallet: this.mainWallet,
        address: await this.mainWallet.getAddress()
    });

    public getSubWallets = (limit: number) => {
        const wallets = Array.from({ length: limit }, (_, i) =>
            new ethers.Wallet(
                this.hdNode.derivePath(`m/44'/60'/0'/0/${i + 1}`)
            ).connect(this.provider)
        );
        return Promise.all(
            wallets.map(async (wallet) => ({
                wallet,
                address: await wallet.getAddress()
            }))
        );
    };

    public sendFunds = async (
        from: Wallet,
        to: Wallet,
        amount: ethers.BigNumber,
        nonce?: number
    ) => {
        const transaction = await from.wallet.sendTransaction({
            to: to.address,
            value: amount,
            gasPrice: ethers.utils.parseUnits('5', 'gwei'),
            gasLimit: 21000,
            nonce
        });
        return transaction.wait();
    };

    public sendAllFunds = async (from: Wallet, to: Wallet, nonce?: number) => {
        const balance = await from.wallet.getBalance();
        const requiredForGas = ethers.utils.parseUnits('5', 'gwei').mul(21000);
        const transactionValue = balance.sub(requiredForGas);
        if (transactionValue.lt(1)) {
            return;
        }
        const transaction = await from.wallet.sendTransaction({
            to: to.address,
            value: transactionValue,
            gasPrice: ethers.utils.parseUnits('5', 'gwei'),
            gasLimit: 21000,
            nonce
        });
        return transaction.wait();
    };

    public sendTokens = async (
        contract: ethers.Contract,
        from: Wallet,
        to: Wallet,
        amount: ethers.BigNumber,
        nonce?: number
    ) => {
        const transaction = contract
            .connect(from.wallet)
            .transfer(to.address, amount, {
                gasPrice: 5,
                nonce
            });
        return transaction.wait();
    };

    public sendAllTokens = async (
        contract: ethers.Contract,
        from: Wallet,
        to: Wallet,
        nonce?: number
    ) => {
        const balance: ethers.BigNumber = await contract.balanceOf(
            from.address
        );
        const transaction = contract
            .connect(from.wallet)
            .transfer(to.address, balance, {
                gasPrice: 5,
                nonce
            });
        return transaction.wait();
    };

    public getPoolLiquidity = async () => {
        const pairAddressx = await this.factoryContract.getPair(
            this.config.inToken,
            this.config.outToken
        );
        if (
            !pairAddressx ||
            pairAddressx.toString().indexOf('0x0000000000000') > -1
        ) {
            return null;
        }
        const inTokenLiquidity: ethers.BigNumber =
            await this.inTokenContract.balanceOf(pairAddressx);

        return inTokenLiquidity;
    };

    public getAmountsOut = async () => {
        const amounts = await this.routerContract.getAmountsOut(
            this.amountToBuy,
            [this.inTokenAddress, this.outTokenAddress]
        );
        return amounts[1];
    };

    public swapTokens = async (from: Wallet, outTokenDecimals: number = 18) => {
        const minAmountOut = ethers.utils.parseUnits(
            this.config.minAmountOut.toFixed(8),
            outTokenDecimals
        );
        const transaction = await this.routerContract
            .connect(from.wallet)
            .swapExactTokensForTokensSupportingFeeOnTransferTokens(
                this.amountToBuy,
                minAmountOut,
                [this.inTokenAddress, this.outTokenAddress],
                from.address,
                Date.now() + 1000 * 60 * 5, //5 minutes
                {
                    gasLimit: this.config.gasLimit.toString(),
                    gasPrice: ethers.utils.parseUnits(
                        this.config.gasPrice.toString(),
                        'gwei'
                    )
                }
            );
        return transaction.wait();
    };
}
