import colors from 'colors/safe';
import { getEnvConfig } from '../config';
import { TelegramDriver } from '../telegramDriver';

const main = async () => {
    const config = getEnvConfig();
    const telegramDriver = await TelegramDriver.create(config);
    const channels = await telegramDriver.getChannels();
    channels.forEach((channel) => {
        console.log(`${channel.title}: ${colors.yellow(channel.id)}`);
    });
};

main();
