import prompts from 'prompts';

export const sleep = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

export const testUntil = <T>(
    test: (iteration: number, cancel: () => void) => Promise<T>,
    ms: number
): Promise<T> => {
    let count = 0;
    return new Promise((resolve) => {
        const cancel = () => resolve(null!);
        const timer = setInterval(async () => {
            try {
                count++;
                const result = await test(count, cancel);
                if (result) {
                    clearInterval(timer);
                    resolve(result);
                }
            } catch (err) {
                console.error('Error ocurred during testUntil Fn');
                console.error(err);
            }
        }, ms);
    });
};

export const getExplorerUrl = (receipt: any) => {
    return `https://www.bscscan.com/tx/${receipt.logs[1].transactionHash}`;
};

export const waitForSellSignal = async () => {
    while (true) {
        const text: string = await prompts({
            type: 'text',
            name: 'value',
            message: 'Type sell:'
        }).then((answer) => answer.value);
        if (text.toLowerCase().includes('sell')) {
            break;
        } else {
            console.log('input is not "sell", ignored');
        }
    }
};
