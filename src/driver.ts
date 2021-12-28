import colors from 'colors/safe';
import { ethers } from 'ethers';
import { mapKeys, mapValues } from 'lodash';
import { EnvConfig, ExecutionConfig } from './config';
import { ERC_20_ABI, FACTORY_ABI, ROUTER_ABI } from './abis';
import { SwapTester } from './swapTester';

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
    private tokenAddressToContract: Record<string, TokenContract>;
    private outTokenContract: TokenContract = null!;

    private amountToBuy: ethers.BigNumber = null!;

    private swapTester: SwapTester;

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

        this.routerContract = new ethers.Contract(
            network.router,
            ROUTER_ABI
        ).connect(this.mainWallet);

        this.factoryContract = new ethers.Contract(
            network.factory,
            FACTORY_ABI
        ).connect(this.mainWallet);

        this.tokenSymbolToContract = mapValues(
            network.tokens,
            (address, symbol) => ({
                symbol,
                address,
                contract: new ethers.Contract(address, ERC_20_ABI).connect(
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
                18
            );

            if (executionConfig.outToken) {
                this.outTokenContract = {
                    symbol: '',
                    address: executionConfig.outToken,
                    contract: new ethers.Contract(
                        executionConfig.outToken,
                        ERC_20_ABI
                    ).connect(this.mainWallet)
                };
            }
        }

        this.swapTester = new SwapTester(config);
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
            contract: new ethers.Contract(address, ERC_20_ABI).connect(
                this.mainWallet
            )
        };
        return this.outTokenContract;
    };

    public getInTokenContract = () => {
        this.requireExecutionConfig();
        return this.tokenSymbolToContract[this.executionConfig.inToken];
    };

    public getTokenContractBySymbol = (symbol: string) => {
        return this.tokenSymbolToContract[symbol];
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
        tokenContract: TokenContract,
        from: Wallet,
        to: Wallet,
        amount: ethers.BigNumber,
        nonce?: number
    ) => {
        const transaction = await tokenContract.contract
            .connect(from.wallet)
            .transfer(to.address, amount, {
                gasPrice: ethers.utils.parseUnits('7', 'gwei'),
                gasLimit: 100000,
                nonce
            });
        return transaction.wait();
    };

    public sendAllTokens = async (
        tokenContract: TokenContract,
        from: Wallet,
        to: Wallet,
        nonce?: number
    ) => {
        const balance: ethers.BigNumber =
            await tokenContract.contract.balanceOf(from.address);
        const transaction = await tokenContract.contract
            .connect(from.wallet)
            .transfer(to.address, balance, {
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

    public isTokenApproved = async (
        tokenContract: TokenContract,
        from: Wallet
    ) => {
        const allowance: ethers.BigNumber = await tokenContract.contract
            .connect(from.wallet)
            .allowance(from.address, this.routerContract.address);
        return allowance.gt(99999999);
    };

    public approveTokens = async (
        tokenContract: TokenContract,
        from: Wallet,
        nonce?: number
    ) => {
        const maxAmount = ethers.BigNumber.from(
            '115792089237316195423570985008687907853269984665640564039457584007913129639935'
        );
        const transaction = await tokenContract.contract
            .connect(from.wallet)
            .approve(this.routerContract.address, maxAmount, { nonce });
        return transaction.wait();
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
        const transaction = this.routerContract
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
                            this.tokenAddressToContract[address]?.symbol ||
                            address
                    )
                    .join(' -> ')}]`
            )}`
        );
        return (await transaction).wait();
    };

    public testSwapTokens = async (
        tokenContract: TokenContract,
        from: Wallet,
        outTokenDecimals: number = 18
    ) => {
        this.requireExecutionConfig();
        const minAmountOut = ethers.utils.parseUnits(
            this.executionConfig.minAmountOut.toFixed(8),
            outTokenDecimals
        );
        const path = this.getPath(tokenContract);
        return this.swapTester.testSwapTokens(
            this.amountToBuy.toString(),
            minAmountOut.toString(),
            path,
            from.address
        );
    };
}
