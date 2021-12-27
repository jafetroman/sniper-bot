import fs from 'fs';

export interface EnvConfig {
    network: {
        keys: string;
        server: string;
        router: string;
        factory: string;
        tokens: Record<string, string>;
    };
    telegram: {
        apiKey: number;
        apiHash: string;
        phoneNumber: string;
    };
}

export interface ExecutionConfig {
    inToken: string;
    outToken?: string;
    telegramChannel?: string;
    instaBuy: boolean;
    amountToBuy: number;
    minAmountOut: number;
    gasPrice: number;
}

export const getEnvConfig = (testnet?: boolean): EnvConfig => {
    const envFile = JSON.parse(
        fs.readFileSync(testnet ? 'envs/test.json' : 'envs/main.json', 'utf-8')
    );
    return envFile;
};

export const getExecutionConfig = (file: string) => {
    const envFile = JSON.parse(fs.readFileSync(file, 'utf-8'));
    return envFile;
};
