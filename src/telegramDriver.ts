import prompts from 'prompts';
import { filter, map, Subject } from 'rxjs';
import { Api, TelegramClient } from 'telegram';
import { NewMessage } from 'telegram/events';
import { StringSession } from 'telegram/sessions';
import { EnvConfig, ExecutionConfig } from './config';

export class TelegramDriver {
    private client: TelegramClient;
    private msjSubject: Subject<Api.Message> = null!;
    private addressRegex = /0x[a-fA-F0-9]{40}/;
    private pairRegex1: RegExp;
    private pairRegex2: RegExp;
    private pairRegex3: RegExp;

    private constructor(
        private config: EnvConfig,
        private executionConfig: ExecutionConfig = null!
    ) {
        this.client = new TelegramClient(
            new StringSession(),
            config.telegram.apiKey,
            config.telegram.apiHash,
            {
                connectionRetries: 5
            }
        );
        const possiblePairs = Object.keys(config.network.tokens);
        const pairsList = [
            ...possiblePairs,
            'BNB',
            ...possiblePairs.map((pair) => pair.toLowerCase()),
            'bnb'
        ].join('|');

        this.pairRegex1 = new RegExp(`(${pairsList}) *(?:\\/|\\\\|\\|:)`);
        this.pairRegex2 = new RegExp(`(?:\\/|\\\\|\\|:) *(${pairsList})`);
        this.pairRegex3 = new RegExp(pairsList);
    }

    public static create = async (
        config: EnvConfig,
        executionConfig?: ExecutionConfig
    ) => {
        const instance = new TelegramDriver(config, executionConfig);
        await instance.client.start({
            phoneNumber: instance.config.telegram.phoneNumber,
            phoneCode: async () =>
                await prompts({
                    type: 'text',
                    name: 'value',
                    message: 'Whats the code?'
                }).then((answer) => answer.value),
            onError: async (err) => true
        });
        return instance;
    };

    public getChannels = async () => {
        const result = await this.client.invoke(
            new Api.messages.GetAllChats({
                exceptIds: []
            })
        );
        return result.chats.map((chat: Api.TypeChat) => ({
            title: (chat as Api.Channel).title,
            id: chat.id.toString()
        }));
    };

    public getAllMessages = () => {
        if (!this.msjSubject) {
            this.msjSubject = new Subject();
            this.client.addEventHandler((newMessage) => {
                this.msjSubject.next(newMessage.message);
            }, new NewMessage({}));
        }
        return this.msjSubject;
    };

    public getChannelMessages = () => {
        if (!this.executionConfig?.telegramChannel) {
            throw new Error(
                'Telegram channel is required in order to execute this method'
            );
        }
        const channelIdBigInt = BigInt(this.executionConfig.telegramChannel);
        return this.getAllMessages().pipe(
            filter((message: Api.Message) => {
                const isFromChannel = (message.peerId as any)?.chatId?.eq(
                    channelIdBigInt
                );
                if (!isFromChannel) {
                    console.log('Receive message from another chat');
                }
                return isFromChannel;
            }),
            map((message: Api.Message) => message.message)
        );
    };

    private getTokenAddress = (message: string) =>
        message.match(this.addressRegex)?.[0];

    private getPair = (message: string) => {
        const pair1 = message.match(this.pairRegex1)?.[1];
        if (pair1) {
            return pair1.toUpperCase();
        }
        const pair2 = message.match(this.pairRegex2)?.[1];
        if (pair2) {
            return pair2.toUpperCase();
        }
        return message.match(this.pairRegex3)?.[0]?.toUpperCase();
    };

    public getTokenAndPair = () => {
        return new Promise<{ address: string; pair?: string }>((resolve) => {
            const subscription = this.getChannelMessages().subscribe(
                (message) => {
                    const address = this.getTokenAddress(message);
                    if (!address) {
                        console.log(
                            'Received message from channel, not address yet'
                        );
                        return;
                    }
                    const pair = this.getPair(message);
                    resolve({ address, pair: pair === 'BNB' ? 'WBNB' : pair });
                    subscription.unsubscribe();
                }
            );
        });
    };

    public close = () => this.client.destroy();
}
