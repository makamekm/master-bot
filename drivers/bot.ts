import { Telegraf, Markup } from 'telegraf';
import VkBot from 'node-vk-bot-api';
import VkMarkup from 'node-vk-bot-api/lib/markup';
import { Bot as MaxBot, Context as MaxContext, Keyboard as MaxKeyboard } from '@maxhub/max-bot-api';
import { App } from '@slack/bolt';
import { Readable } from 'stream';
import express from 'express';
import bodyParser from 'body-parser';

import { decodeJSON } from '../utils/json';
import type { DataSource } from 'typeorm';
import { QuestionSource } from '../sources/question-source';
import { isFirstLetterUppercase } from '../utils/text';

export type FileFn = {
    url: string;
    filename: string;
    origin: string;
    ext: string;
};

export type BotKeyboard = {
    text: string;
    type?: string;
    data?: any;
}[];

export type CommandData = {
    bot: Bot;
    command?: string;
    id?: string;
    type: 'vk' | 'tg' | 'max' | 'slack';
    chatId: string;
    userId: string;
    replyId?: string;
    text?: string;
    role?: string;
    data?: any;
    files?: FileFn[];
};

export type CommandFunction = (data: CommandData) => Promise<void> | void;

function getVKChatId(ctx: VkBotContext) {
    const chatId = ctx.message.peer_id || ctx.message.from_id || (ctx.message as any).user_id;
    return chatId;
}

function getVKUserId(ctx: VkBotContext) {
    const userId = ctx.message.from_id || (ctx.message as any).user_id;
    return userId;
}

export class Bot {
    questionSource: QuestionSource;

    constructor(db: DataSource) {
        this.questionSource = new QuestionSource(db);
    }

    app: express.Express;
    vk = !process.env.VK_KEY ? null : new VkBot({
        token: process.env.VK_KEY!,
        secret: process.env.VK_SECRET!,
        confirmation: process.env.VK_CONFIRMATION!,
        group_id: 0,
    });
    tg = !process.env.TG_KEY ? null : new Telegraf(process.env.TG_KEY);
    max = !process.env.MAX_KEY ? null : new MaxBot(process.env.MAX_KEY);
    slack = !process.env.SLACK_BOT_KEY ? null : new App({
        token: process.env.SLACK_BOT_KEY,
        signingSecret: process.env.SLACK_BOT_SIGNING_SECRET,
        socketMode: true,
        appToken: process.env.SLACK_BOT_APP_TOKEN,
    });

    async start() {
        if (!!process.env.PORT) {
            this.app = express();
        }

        this.app?.use(bodyParser.json());

        if (!!process.env.VK_SECRET) {
            this.vk?.startPolling((err) => {
                if (err) {
                    console.error(err);
                }
                return {};
            });
        }
        else {
            this.vk?.start();
            if (this.vk != null) this.app?.post('/vk', this.vk.webhookCallback as any);
        }

        this.tg?.launch();

        await Promise.all([
            // this.tg?.launch(),
            this.max?.start(),
            this.slack?.start(),
        ]);

        if (!!process.env.PORT) this.app?.listen(process.env.PORT);
    }

    async declareCommands({ id, type, message, commands }: {
        id?: string;
        type?: 'vk' | 'tg' | 'max' | 'slack';
        message?: string;
        commands: {
            name: string;
            description: string;
        }[]
    }) {
        if (id != null) {
            if (type === 'vk') {
                const vkButtons = VkMarkup.keyboard(commands.map(
                    key => ([VkMarkup.button(key.name, "secondary")])
                ));
                await this.vk?.sendMessage(
                    id,
                    message,
                    null,
                    vkButtons,
                );
            }
        } else {
            try {
                await this.tg?.telegram.setMyCommands(commands.map(
                    key => ({
                        command: key.name,
                        description: key.description,
                    })
                ));
            } catch (error) {
                console.error();
            }
            try {
                await this.max?.api.setMyCommands(commands);
            } catch (error) {
                console.error();
            }
        }
    }

    on(fn: CommandFunction) {
        this.vk?.on(async (ctx) => {
            try {
                const chatId = getVKChatId(ctx);
                const uid = decodeJSON(ctx.message.payload);
                const data = typeof uid === 'string' ? await this.questionSource.get(uid) : null;
                await fn({
                    bot: this,
                    id: ctx.message.id.toString(),
                    type: 'vk',
                    chatId: chatId,
                    userId: getVKUserId(ctx),
                    replyId: ctx.message?.conversation_message_id?.toString(),
                    text: ctx.message.text,
                    data: data,
                });

                // if (ctx.message.id != null) {
                //     try {
                //         await this.vk?.execute("messages.delete", {
                //             peer_id: ctx.message.peer_id ?? ctx.message?.from_id,
                //             delete_for_all: 1,
                //             message_ids: ctx.message.id,
                //         });
                //     } catch (error) {
                //         console.error(error);
                //     }
                // }
            } catch (e) {
                console.error(e);
            }
        });

        this.tg?.action(RegExp('.+'), async (ctx) => {
            const chat = await ctx.getChat();

            try {
                const files: FileFn[] = [];

                const message: any = ctx?.msg ?? ctx?.message;
                const photos: any[] = message?.photo ?? [];
                const document: any = message?.document;

                for (const photo of photos) {
                    const file = await ctx.telegram.getFile(photo.file_id);
                    const fileUrl = `https://api.telegram.org/file/bot${process.env.TG_KEY}/${file.file_path}`;
                    const names = photo.file_name?.split('.');
                    const ext = names?.[(names?.length ?? 0) - 1];
                    files.push({
                        url: fileUrl,
                        filename: `photo_${Date.now()}.jpg`,
                        origin: photo.file_name,
                        ext: ext,
                    });
                }

                if (document != null) {
                    const file = await ctx.telegram.getFile(document.file_id);
                    const fileUrl = `https://api.telegram.org/file/bot${process.env.TG_KEY}/${file.file_path}`;
                    const names = document.file_name?.split('.');
                    const ext = names?.[(names?.length ?? 0) - 1];
                    files.push({
                        url: fileUrl,
                        filename: `file_${Date.now()}.${ext}`,
                        origin: document.file_name,
                        ext: ext,
                    });
                }

                const text = message?.text;
                const uid = ctx.match?.[0] ?? text?.split(' ')?.slice(1)?.join(' ');
                const data = await this.questionSource.get(uid);

                await fn({
                    bot: this,
                    id: message?.message_id.toString(),
                    type: 'tg',
                    chatId: chat?.id?.toString(),
                    userId: chat?.id?.toString(),
                    replyId: message?.message_thread_id ?? message?.message_id,
                    text: text,
                    role: ctx.state?.role,
                    data: data,
                    files: files,
                });

                const id = message?.message_thread_id ?? message?.message_id;
                if (chat?.id != null && id != null) {
                    await this.tg?.telegram.deleteMessage(chat?.id, id);
                }
            } catch (e) {
                console.error(e);
            }
        });

        this.tg?.on('message', async (ctx) => {
            const chat = await ctx.getChat();

            try {
                const files: FileFn[] = [];

                const message: any = ctx?.msg ?? ctx?.message;
                const photos: any[] = message?.photo ?? [];
                const document: any = message?.document;

                for (const photo of photos) {
                    const file = await ctx.telegram.getFile(photo.file_id);
                    const fileUrl = `https://api.telegram.org/file/bot${process.env.TG_KEY}/${file.file_path}`;
                    const names = photo.file_name?.split('.');
                    const ext = names?.[(names?.length ?? 0) - 1];
                    files.push({
                        url: fileUrl,
                        filename: `photo_${Date.now()}.jpg`,
                        origin: photo.file_name,
                        ext: ext,
                    });
                }

                if (document != null) {
                    const file = await ctx.telegram.getFile(document.file_id);
                    const fileUrl = `https://api.telegram.org/file/bot${process.env.TG_KEY}/${file.file_path}`;
                    const names = document.file_name?.split('.');
                    const ext = names?.[(names?.length ?? 0) - 1];
                    files.push({
                        url: fileUrl,
                        filename: `file_${Date.now()}.${ext}`,
                        origin: document.file_name,
                        ext: ext,
                    });
                }

                const text = message?.text;
                const uid = text?.split(' ')?.slice(1)?.join(' ');
                const data = await this.questionSource.get(uid);

                await fn({
                    bot: this,
                    id: message?.message_id.toString(),
                    type: 'tg',
                    chatId: chat?.id?.toString(),
                    userId: chat?.id?.toString(),
                    replyId: message?.message_thread_id ?? message?.message_id,
                    text: text,
                    role: ctx.state?.role,
                    data: data,
                    files: files,
                });

                // const id = message?.message_thread_id ?? message?.message_id;
                // if (chat?.id != null && id != null) {
                //     await this.tg?.telegram.deleteMessage(chat?.id, id);
                // }
            } catch (e) {
                console.error(e);
            }
        });

        this.max?.on('message_created', async (ctx: MaxContext) => {
            try {
                // const data = await this.questionSource.get(uid);

                await fn({
                    bot: this,
                    id: ctx.messageId,
                    type: 'max',
                    chatId: ctx.chatId.toString(),
                    userId: ctx.chatId.toString(),
                    replyId: ctx.message?.body?.mid,
                    text: ctx.message.body?.text,
                    // data: ctx.message.body?.attachments,
                });

                if (ctx.message?.body?.mid != null) {
                    await this.max?.api.deleteMessage(ctx.message.body.mid);
                }
            } catch (e) {
                console.error(e);
            }
        });

        this.slack?.action(RegExp('.+'), async (ctx) => {
            try {
                const action: any = ctx.action;
                const message = (ctx.body as any).message;

                const data = await this.questionSource.get(action?.value);

                await fn({
                    bot: this,
                    id: action.action_ts,
                    type: 'slack',
                    chatId: ctx.body?.channel?.id,
                    userId: ctx.body?.user?.id,
                    replyId: ctx.body?.channel?.id,
                    text: action.text?.text,
                    data: data,
                });

                if (ctx.body?.channel?.id != null && message.ts != null) {
                    await this.slack?.client.chat.delete({
                        channel: ctx.body.channel.id,
                        ts: message.ts,
                    });
                }
            } catch (e) {
                console.error(e);
            }
        });
    }

    command(command: string, fn: CommandFunction) {
        this.vk?.command(isFirstLetterUppercase(command) ? command : `/${command}`, async (ctx) => {
            try {
                const data = await this.questionSource.get(ctx.message.payload);

                await fn({
                    bot: this,
                    command,
                    id: ctx.message.id.toString(),
                    type: 'vk',
                    chatId: getVKChatId(ctx),
                    userId: getVKUserId(ctx),
                    text: ctx.message.text,
                    data: data,
                });
            } catch (e) {
                console.error(e);
            }
        });

        this.tg?.command(command, async (ctx) => {
            const message = ctx.message;
            const chat = message?.chat ?? await ctx.getChat();

            try {
                const text = message.text;
                const uid = text.split(' ').slice(1).join(' ');
                const data = await this.questionSource.get(uid);
                await fn({
                    bot: this,
                    command,
                    id: message.message_id.toString(),
                    type: 'tg',
                    chatId: chat.id.toString(),
                    userId: chat.id.toString(),
                    text: text,
                    role: ctx.state.role,
                    data: data,
                });
            } catch (e) {
                console.error(e);
            }
        });

        this.max?.command(command, async (ctx: MaxContext) => {
            try {
                await fn({
                    bot: this,
                    command,
                    id: ctx.messageId,
                    type: 'max',
                    chatId: ctx.chatId.toString(),
                    userId: ctx.chatId.toString(),
                    text: ctx.message.body.text,
                    // data: ctx.message.body.attachments,
                });
            } catch (e) {
                console.error(e);
            }
        });

        this.slack?.message(`#${command}`, async (ctx) => {
            try {
                const message: any = ctx.message;
                const text = message.text;
                const uid = text.split(' ').slice(1).join(' ');
                const data = await this.questionSource.get(uid);
                await fn({
                    bot: this,
                    command,
                    id: message.client_msg_id,
                    type: 'slack',
                    chatId: message.channel,
                    userId: message.user,
                    text: text,
                    data: data,
                });
            } catch (e) {
                console.error(e);
            }
        });

        // (command, async (ctx: MaxContext) => {
        //     try {
        //         await fn({
        //             id: ctx.messageId,
        //             type: 'slack',
        //             chatId: ctx.chatId.toString(),
        //             userId: ctx.chatId.toString(),
        //             text: ctx.message.body.text,
        //             data: ctx.message.body.attachments,
        //         });
        //     } catch (e) {
        //         console.error(e);
        //     }
        // });
    }

    async send(id: string, type: string, text: string, keyboard?: BotKeyboard) {
        try {
            if (keyboard?.length) {
                keyboard = await Promise.all(keyboard.filter(Boolean).map(async element => {
                    element.data = await this.questionSource.add(element.data);
                    return element
                }));
            }

            if (type === 'vk') {
                const buttons = !!keyboard?.length
                    ? VkMarkup.keyboard(keyboard.map(
                        key => [VkMarkup.button(key.text, key.type as any, key.data)]
                    )).oneTime(true)
                    : null;
                await this.vk?.sendMessage(
                    id,
                    text,
                    null,
                    buttons,
                );
            } else if (type === 'tg') {
                await this.tg?.telegram.sendMessage(id, text, {
                    reply_markup: !!keyboard?.length ? {
                        inline_keyboard: keyboard.map(
                            key => [Markup.button.callback(key.text, key.data)]
                        ),
                    } : null,
                });
            } else if (type === 'max') {
                const intId = parseInt(id, 10);
                const attachments = [];

                if (!!keyboard?.length) {
                    attachments.push(MaxKeyboard.inlineKeyboard(keyboard.map(
                        key => [MaxKeyboard.button.callback(key.text, key.data, {
                            intent: key.type as any,
                        })]
                    )));
                }

                await this.max?.api.sendMessageToChat(intId, text, {
                    attachments: attachments,
                });
            } else if (type === 'slack') {
                await this.slack?.client.chat.postMessage({
                    channel: id,
                    text: text,
                    blocks: !!keyboard?.length ? [
                        {
                            type: "actions",
                            elements: keyboard.map(
                                key => ({
                                    text: {
                                        type: "plain_text",
                                        emoji: true,
                                        text: key.text,
                                    },
                                    value: key.data,
                                    type: 'button',
                                })
                            ),
                        }
                    ] : null,
                });
            } else {
                throw new Error(`NOT IMPLEMENTED ${type}`);
            }
        } catch (e) {
            console.error(e);
        }
    }

    async sendPhoto(id: string, type: string, text: string, file: {
        source: string | Readable | Buffer<ArrayBufferLike>;
        filename?: string;
    }, keyboard?: BotKeyboard) {
        try {
            if (keyboard?.length) {
                keyboard = await Promise.all(keyboard.filter(Boolean).map(async element => {
                    element.data = await this.questionSource.add(element.data);
                    return element
                }));
            }

            if (type === 'vk') {
                const buttons = !!keyboard?.length
                    ? VkMarkup.keyboard(keyboard.map(
                        key => ([VkMarkup.button(key.text, key.type as any, key.data)])
                    )).oneTime(true)
                    : null;
                await this.vk?.sendMessage(
                    id,
                    text,
                    file.source as any,
                    buttons,
                );
            } else if (type === 'tg') {
                await this.tg.telegram.sendPhoto(id, {
                    source: file.source,
                    filename: file.filename,
                } as any, {
                    caption: text,
                    reply_markup: !!keyboard?.length ? {
                        inline_keyboard: keyboard.map(
                            key => ([Markup.button.callback(key.text, key.data)])
                        ),
                    } : null,
                });
            } else if (type === 'max') {
                const intId = parseInt(id, 10);
                const attachments = [];

                const uploadedImage = await this.max?.api.uploadImage({
                    source: file.source as any,
                });

                attachments.push(uploadedImage.toJson());

                if (!!keyboard?.length) {
                    attachments.push(MaxKeyboard.inlineKeyboard(keyboard.map(
                        key => ([MaxKeyboard.button.callback(key.text, key.data, {
                            intent: key.type as any,
                        })])
                    )));
                }

                await this.max?.api.sendMessageToChat(intId, text, {
                    attachments: attachments,
                });
            } else if (type === 'slack') {
                const splts = file.filename?.split('.') ?? [];
                const ext = splts[splts.length - 1];
                const res: any = await this.slack?.client.files.uploadV2({
                    channel_id: id,
                    file: file.source,
                    filetype: ext || 'txt',
                    filename: file.filename,
                });
                const uploadedImage = res.files?.[0]?.files?.[0];

                if (!uploadedImage?.id) throw new Error('Не удалось загрузить фото');

                if (!!text) await this.slack?.client.chat.postMessage({
                    channel: id,
                    text: text,
                    blocks: [
                        !!keyboard?.length ? {
                            type: "actions",
                            elements: keyboard.map(
                                key => ({
                                    text: {
                                        type: "plain_text",
                                        emoji: true,
                                        text: key.text,
                                    },
                                    value: key.data,
                                    type: 'button',
                                })
                            ),
                        } : null
                    ].filter(Boolean),
                });
            } else {
                throw new Error(`NOT IMPLEMENTED ${type}`);
            }
        } catch (e) {
            console.error(e);
        }
    }

    async sendFile(id: string, type: string, text: string, file: {
        source: string | Readable | Buffer<ArrayBufferLike>;
        filename?: string;
    }, keyboard?: BotKeyboard) {
        try {
            if (keyboard?.length) {
                keyboard = await Promise.all(keyboard.filter(Boolean).map(async element => {
                    element.data = await this.questionSource.add(element.data);
                    return element
                }));
            }

            if (type === 'vk') {
                const buttons = !!keyboard?.length
                    ? VkMarkup.keyboard(keyboard.map(
                        key => ([VkMarkup.button(key.text, key.type as any, key.data)])
                    )).oneTime(true)
                    : null;
                await this.vk?.sendMessage(
                    id,
                    text,
                    file.source as any,
                    buttons,
                );
            } else if (type === 'tg') {
                await this.tg.telegram.sendDocument(id, {
                    source: file.source,
                    filename: file.filename,
                } as any, {
                    caption: text,
                    reply_markup: !!keyboard?.length ? {
                        inline_keyboard: keyboard.map(
                            key => ([Markup.button.callback(key.text, key.data)])
                        ),
                    } : null,
                });
            } else if (type === 'max') {
                const intId = parseInt(id, 10);
                const attachments = [];

                const uploadedFile = await this.max?.api.uploadFile({
                    source: file.source as any,
                });

                attachments.push(uploadedFile.toJson());

                if (!!keyboard?.length) {
                    attachments.push(MaxKeyboard.inlineKeyboard(keyboard.map(
                        key => ([MaxKeyboard.button.callback(key.text, key.data, {
                            intent: key.type as any,
                        })])
                    )));
                }

                await this.max?.api.sendMessageToChat(intId, text, {
                    attachments: attachments,
                });
            } else if (type === 'slack') {
                const splts = file.filename?.split('.') ?? [];
                const ext = splts[splts.length - 1];
                const res: any = await this.slack?.client.files.uploadV2({
                    channel_id: id,
                    file: file.source,
                    filetype: ext || 'txt',
                    filename: file.filename,
                });
                const uploadedFile = res.files?.[0]?.files?.[0];

                if (!uploadedFile?.id) throw new Error('Не удалось загрузить файл');

                if (!!text) await this.slack?.client.chat.postMessage({
                    channel: id,
                    text: text,
                    blocks: [
                        !!keyboard?.length ? {
                            type: "actions",
                            elements: keyboard.map(
                                key => ({
                                    text: {
                                        type: "plain_text",
                                        emoji: true,
                                        text: key.text,
                                    },
                                    value: key.data,
                                    type: 'button',
                                })
                            ),
                        } : null
                    ].filter(Boolean),
                });
            } else {
                throw new Error(`NOT IMPLEMENTED ${type}`);
            }
        } catch (e) {
            console.error(e);
        }
    }
}
