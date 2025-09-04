import { DataSource } from "typeorm"
import { resolve } from "path"

import { User, Message, Question } from "../";

export const DBDriver = new DataSource({
    type: "sqlite",
    database: resolve(`./db.sqlite`),
    entities: [
        User,
        Message,
        Question,
    ],
    synchronize: true,
    logging: true,
});
