import type { DataSource } from "typeorm";
import { v4 as uuidv4 } from "uuid";

import { Question } from "../tables/question";
import { decodeJSON, encodeJSON } from "../utils/json";

export class QuestionSource {
    constructor(private readonly db: DataSource) { }

    async get(uid: string) {
        const res = await this.db.manager.findOneBy(Question, {
            uid: uid,
        });
        return decodeJSON(res?.json)
    }

    async add(json: any) {
        const uid = uuidv4();
        if (json != null) {
            await this.db.manager.insert(Question, {
                uid: uid,
                json: encodeJSON(json),
            });
            return uid
        }
    }
}