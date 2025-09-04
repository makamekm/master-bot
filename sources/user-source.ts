import type { DataSource } from "typeorm";

import { User } from "../tables/user";

export class UserSource {
    constructor(private readonly db: DataSource) { }

    async get(id: string, type: string): Promise<User> {
        const uid = `${type}_${id}`;
        let user = await this.db.manager.findOneBy(User, {
            uid,
        });

        if (user == null) {
            await this.db.manager.insert(User, {
                uid,
                id: id,
                type: type,
            });
            user = await this.db.manager.findOneBy(User, {
                uid,
            });
        }

        return user;
    }

    async save(user: User) {
        await this.db.manager.update(User, {
            uid: user.uid,
        }, user);
    }
}
