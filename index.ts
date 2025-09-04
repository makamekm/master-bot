import type { DataSource } from 'typeorm';

import { UserSource } from './sources/user-source';
import { MessageSource } from './sources/message-source';
import { Bot, type CommandData } from './drivers/bot';
import { isFirstLetterUppercase } from './utils/text';
import type { User } from './tables/user';

export * from './drivers/bot';
export * from './tables/message';
export * from './tables/question';
export * from './tables/user';

export * from './sources/message-source';
export * from './sources/question-source';
export * from './sources/user-source';

export * from './utils/file';
export * from './utils/json';
export * from './utils/text';

export type OptionItem = {
    key: string;
    text: string;
    type?: string;
} | string;

export type Step = {
    command?: string;
    description?: string;
    text: (ctx: CommandData, user: User, prevStep?: string) => (Promise<string | null | undefined> | string | null | undefined);
    process?: (ctx: CommandData, user: User, prevStep?: string) => (Promise<string | [string]> | string | [string]);
    options?: (ctx: CommandData, user: User, prevStep?: string) => (Promise<OptionItem[]> | OptionItem[]);
};

export async function run(
    steps: {
        [id: string]: Step;
    },
    db: DataSource,
): Promise<Bot> {
    const bot = new Bot(db);

    const userSource = new UserSource(db);
    const messageSource = new MessageSource(db);

    const commands = Object.values(steps)
        .filter(step => !!step.command && !!step.description)
        .map((step) => ({
            name: isFirstLetterUppercase(step.command) ? step.command : `/${step.command}`,
            command: step.command,
            description: step.description,
        }));

    await bot.declareCommands({
        commands,
    });

    const onStep = async (ctx: CommandData, user: User) => {
        let currentStepKey = user.step;

        if (ctx.command) {
            for (const key of Object.keys(steps)) {
                if (steps[key].command === ctx.command) {
                    currentStepKey = key;
                    break;
                }
            }
        }

        if (steps[currentStepKey] != null) {
            let nextStep = await steps[currentStepKey].process?.(ctx, user, currentStepKey) ?? currentStepKey;
            while (Array.isArray(nextStep)) {
                const nextStepKey = nextStep[0];
                nextStep = await steps[nextStepKey].process?.(ctx, user, currentStepKey) ?? nextStepKey ?? currentStepKey;
            }
            if (nextStep && steps[nextStep]) {
                const text = await steps[nextStep].text(ctx, user, currentStepKey);
                if (!!text) {
                    const options = await steps[nextStep].options?.(ctx, user, currentStepKey);
                    await bot.send(ctx.chatId, ctx.type, text, options?.filter(Boolean)?.map(option => typeof option === 'string' ? ({
                        text: option,
                        data: {
                            key: option,
                        },
                    }) : ({
                        text: option.text,
                        type: option.type,
                        data: {
                            key: option.key,
                        },
                    })));
                }
                if (user.step !== nextStep) {
                    user.step = nextStep;
                    await userSource.save(user);
                }
            }
        }
    }

    commands.forEach((command, index) => {
        bot.command(command.command, async (ctx) => {
            if (await messageSource.register(ctx.id, ctx.type)) return;
            // await bot.declareCommands({
            //     id: ctx.chatId,
            //     type: ctx.type,
            //     message: vkHelloMessage,
            //     commands,
            // });
            const user = await userSource.get(ctx.userId, ctx.type);
            await onStep(ctx, user);
        });
    });

    bot.on(async (ctx) => {
        if (await messageSource.register(ctx.id, ctx.type)) return;
        const user = await userSource.get(ctx.userId, ctx.type);
        await onStep(ctx, user);
    });

    await bot.start();

    return bot;
}
