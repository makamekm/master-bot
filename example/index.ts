import { v4 as uuidv4 } from "uuid";
import type { DataSource } from "typeorm";
import { run, type Step, type User } from "../"; // Use https://github.com/makamekm/master-bot

import { DBDriver } from "./data-source";

export const reset = async (user: User) => {
    // await user.saveSession({
    //     id: uuidv4(),
    // });
    // user.data.verifyed = false;
    // user.data.registered = false;
    // await user.save();
};

export function buildSteps(db: DataSource): {
    [id: string]: Step;
} {
    return {
        'hello': {
            command: 'Начать',
            description: 'Регистрация',
            text(ctx, user) {
                return `Привет`

            },
            async process(ctx, user) {
                return ['start']
            }
        },
        'start': {
            command: 'start',
            description: 'Регистрация',
            text(ctx, user) {
                if (!ctx.command && ctx.text?.length) {
                    return `Введенный код не верен, попробуйте снова:`
                } else {
                    return `Вводя секретный код, Вы даете согласие на обработку персональных данных (https://vk.cc/cOvhfn).

                    Введите секретный код верификации:`
                }
            },
            async process(ctx, user) {
                if (ctx.command) {
                    await reset(user);
                } else if (ctx.text === process.env.TEACH_KEY) {
                    // user.data.verifyed = true;
                    // await user.save();
                    return "step0";
                }
            },
        },
        'step0': {
            text(ctx, user) {
                return `Есть ли у Вас уже наставник или наставляемый, с которым Вы хотели бы работать? Если есть, то дальнейшая работа может продолжаться в вашей паре без использования чат-бота. Основная информация по конкурсному треку «Наставничество» указана на сайте «Флагманы образования» (https://vk.cc/cORfwF). Оба участника должны быть зарегистрированы в конкурсном треке «Наставничество» проекта «Флагманы образования» президентской платформы «Россия - страна возможностей». 
                
 Каков ваш статус?`
            },
            async process(ctx, user) {
                // const session = user.getSession();
                const key = ctx.data?.key;
                if (key?.length) {
                    // session['step0'] = key;
                    // await user.saveSession(session);
                    // if (key === "Наставляемый") return "step1_2";
                    return "passive";
                }
            },
            options(ctx, user) {
                return [
                    'Наставник',
                    'Наставляемый',
                ];
            },
        },
        'passive': {
            async text(ctx, user) {
                return null;
            },
        },
    };
}

async function bootstrap() {
    const db = await DBDriver.initialize();
    const steps = buildSteps(db);

    await run(
        steps,
        db,
    );
}

bootstrap();
