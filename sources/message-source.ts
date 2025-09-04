import type { DataSource } from "typeorm";
import { v4 as uuidv4 } from "uuid";

import { Message } from "../tables/message";

export class MessageSource {
    constructor(private readonly db: DataSource) { }

    async exist(id: string, chatId: string, type: string) {
        return await this.db.manager.count(Message, {
            where: {
                id: id,
                chatId: chatId,
                type: type,
            },
            take: 1,
        }) > 0;
    }

    async add(id: string, chatId: string, type: string) {
        return await this.db.manager.insert(Message, {
            uid: uuidv4(),
            id: id,
            chatId: chatId,
            type: type,
        });
    }

    async register(id: string | null | undefined, chatId: string, type: string) {
        if (id == null) {
            return false;
        }

        const existed = await this.db.manager.count(Message, {
            where: {
                id: id,
                chatId: chatId,
                type: type,
            },
            take: 1,
        }) > 0;

        if (!existed) {
            await this.add(id, chatId, type);
        }

        return existed;
    }
}