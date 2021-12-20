import fs from 'fs';
import dotenv from 'dotenv';
import { mapKeys } from 'lodash';
import { ethers } from 'ethers';

interface EnvFile {
    keys: string;
    server: string;
    router: string;
    factory: string;
}

interface ExecutionFile {
    inToken: string;
    inTokenDecimals: number;
    outToken?: string;
    amountToBuy: number;
    minAmountOut: number;
    gasLimit: number;
    gasPrice: number;
}

export type Config = ExecutionFile & EnvFile;

export const getConfig = (file: string, testnet: boolean): Config => {
    const envFile = dotenv.config({ path: testnet ? 'test.env' : 'main.env' });
    const executionFile = JSON.parse(fs.readFileSync(file, 'utf-8'));
    return { ...mapKeys(envFile, (_, k) => k.toLowerCase()), ...executionFile };
};