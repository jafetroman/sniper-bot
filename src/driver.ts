import colors from 'colors/safe';
import { ethers } from 'ethers';
import { mapKeys, mapValues } from 'lodash';
import { EnvConfig, ExecutionConfig } from './config';
import erc20Abi from './erc20Abi';

export interface Wallet {
    wallet: ethers.Wallet;
    address: string;
}

export interface TokenContract {
    symbol: string;
    address: string;
    contract: ethers.Contract;
}

export class Driver {
    private provider: ethers.providers.JsonRpcProvider;
    private hdNode: ethers.utils.HDNode;
    private mainWallet: ethers.Wallet;
    private routerContract: ethers.Contract;
    private factoryContract: ethers.Contract;

    private tokenSymbolToContract: Record<string, TokenContract>;
    private outTokenContract: TokenContract = null!;

    private tokenAddressToContract: Record<string, TokenContract>;

    private amountToBuy: ethers.BigNumber = null!;

    constructor(
        private config: EnvConfig,
        private executionConfig: ExecutionConfig = null!
    ) {
        const network = config.network;
        const isWssServer = network.server.startsWith('wss://');

        this.provider = isWssServer
            ? new ethers.providers.WebSocketProvider(network.server)
            : new ethers.providers.JsonRpcProvider(network.server);

        this.hdNode = ethers.utils.HDNode.fromMnemonic(network.keys);

        this.mainWallet = new ethers.Wallet(
            this.hdNode.derivePath(`m/44'/60'/0'/0/0`)
        ).connect(this.provider);

        this.routerContract = new ethers.Contract(network.router, [
            'function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)',
            'function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
            'function swapExactTokensForTokensSupportingFeeOnTransferTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
            'function swapETHForExactTokens(uint amountOut, address[] calldata path, address to, uint deadline) external  payable returns (uint[] memory amounts)',
            'function swapExactETHForTokens( uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)'
        ]).connect(this.mainWallet);

        this.factoryContract = new ethers.Contract(network.factory, [
            'event PairCreated(address indexed token0, address indexed token1, address pair, uint)',
            'function getPair(address tokenA, address tokenB) external view returns (address pair)'
        ]).connect(this.mainWallet);

        this.tokenSymbolToContract = mapValues(
            network.tokens,
            (address, symbol) => ({
                symbol,
                address,
                contract: new ethers.Contract(address, erc20Abi).connect(
                    this.mainWallet
                )
            })
        );

        this.tokenAddressToContract = mapKeys(
            this.tokenSymbolToContract,
            (contract) => contract.address
        );

        if (executionConfig) {
            this.amountToBuy = ethers.utils.parseUnits(
                executionConfig.amountToBuy.toFixed(8),
                executionConfig.inTokenDecimals
            );

            if (executionConfig.outToken) {
                this.outTokenContract = {
                    symbol: '',
                    address: executionConfig.outToken,
                    contract: new ethers.Contract(
                        executionConfig.outToken,
                        erc20Abi
                    ).connect(this.mainWallet)
                };
            }
        }
    }

    private requireExecutionConfig = () => {
        if (!this.executionConfig) {
            throw new Error(
                'Execution config is required in order to call this method'
            );
        }
    };

    private getPath = (tokenContract: TokenContract) => {
        const inTokenContract =
            this.tokenSymbolToContract[this.executionConfig.inToken];
        if (inTokenContract === tokenContract) {
            return [inTokenContract.address, this.outTokenContract.address];
        }
        return [
            inTokenContract.address,
            tokenContract.address,
            this.outTokenContract.address
        ];
    };

    public setOutTokenAddress = (address: string) => {
        this.outTokenContract = {
            symbol: '',
            address: address,
            contract: new ethers.Contract(address, erc20Abi).connect(
                this.mainWallet
            )
        };
        return this.outTokenContract;
    };

    public getInTokenContract = () => {
        this.requireExecutionConfig();
        return this.tokenSymbolToContract[this.executionConfig.inToken];
    };

    public getOutTokenContract = () => {
        this.requireExecutionConfig();
        return this.outTokenContract;
    };

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

    public getPoolLiquidity = async (tokenContract: TokenContract) => {
        this.requireExecutionConfig();
        const pairAddressx = await this.factoryContract.getPair(
            tokenContract.address,
            this.outTokenContract.address
        );
        if (
            !pairAddressx ||
            pairAddressx.toString().indexOf('0x0000000000000') > -1
        ) {
            return null;
        }
        const inTokenLiquidity: ethers.BigNumber =
            await tokenContract.contract.balanceOf(pairAddressx);

        return inTokenLiquidity;
    };

    public getAmountsOut = async (tokenContract: TokenContract) => {
        this.requireExecutionConfig();
        const path = this.getPath(tokenContract);
        const amounts = await this.routerContract.getAmountsOut(
            this.amountToBuy,
            path
        );
        return amounts[1];
    };

    public swapTokens = async (
        tokenContract: TokenContract,
        from: Wallet,
        gasPrice: number,
        outTokenDecimals: number = 18
    ): Promise<ethers.ContractTransaction> => {
        this.requireExecutionConfig();
        const minAmountOut = ethers.utils.parseUnits(
            this.executionConfig.minAmountOut.toFixed(8),
            outTokenDecimals
        );
        const path = this.getPath(tokenContract);
        const gasLimit = path.length > 2 ? '400000' : '200000';
        const transaction = await this.routerContract
            .connect(from.wallet)
            .swapExactTokensForTokens(
                this.amountToBuy,
                minAmountOut,
                path,
                from.address,
                Date.now() + 1000 * 60 * 5, //5 minutes
                {
                    gasLimit,
                    gasPrice: ethers.utils.parseUnits(
                        gasPrice.toString(),
                        'gwei'
                    )
                }
            );
        console.log(
            `Buying token using following route: ${colors.yellow(
                `[${path
                    .map(
                        (address) =>
                            this.tokenAddressToContract[address] || address
                    )
                    .join(' -> ')}]`
            )}`
        );
        return transaction.wait();
    };

    public testTokens = async (
        tokenContract: TokenContract,
        from: Wallet,
        outTokenDecimals: number = 18
    ) => {};
}
