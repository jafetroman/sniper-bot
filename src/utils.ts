export const sleep = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

export const testUntil = (test: () => Promise<any>, ms: number) =>
    new Promise((resolve) => {
        const timer = setInterval(async () => {
            try {
                const result = await test();
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
