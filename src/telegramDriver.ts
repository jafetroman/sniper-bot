import prompts from 'prompts';
import { filter, Subject } from 'rxjs';
import { Api, TelegramClient } from 'telegram';
import { NewMessage } from 'telegram/events';
import { StringSession } from 'telegram/sessions';
import { EnvConfig, ExecutionConfig } from './config';

export class TelegramDriver {
    private client: TelegramClient;
    private msjSubject: Subject<Api.Message> = null!;

    private constructor(private config: EnvConfig) {
        this.client = new TelegramClient(
            new StringSession(),
            config.telegram.apiKey,
            config.telegram.apiHash,
            {
                connectionRetries: 5
            }
        );
    }

    public static create = async (config: EnvConfig) => {
        const instance = new TelegramDriver(config);
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
            this.client.addEventHandler(
                (newMessage) => this.msjSubject.next(newMessage.message),
                new NewMessage({})
            );
        }
        return this.msjSubject;
    };

    public getChannelMessages = (channelId: string) => {
        return this.getAllMessages().pipe(
            filter((message) => message.sender?.id === channelId)
        );
    };

    public getTokenAndPair = (channelId: string) => {};
}
