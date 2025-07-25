import { z } from 'zod';

import { factory as f } from 'typescript';

export function findDrizzleTables<T>(name: string, model: z.ZodType<T>): [string, any][] {
    const result: [string, any][] = [];

    const meta = model.getMeta() ?? {};

    if (meta.primaryKey != null) {
        result.push([name, model]);
    }

    if (model instanceof z.ZodObject) {
        const shape = model.shape;

        for (const [key, subModel] of Object.entries(shape)) {
            const subResults = findDrizzleTables(`${name}_${key}`, subModel as any);
            result.push(...subResults);
        }
    }

    return result;
}

export function createDrizzleTable<T>(name: string, model: z.ZodType<T>): [any, string[]] {
    const meta = model.getMeta() ?? {};

    if (meta.primaryKey == null) {
        throw new Error(`Model ${name} does not have a primary key defined.`);
    }

    const [tableDefinition, imports] = intoDrizzleTableDefintion(model, undefined);

    const table = f.createVariableDeclaration(
        name,
    );

    return [table, imports];
}

function intoDrizzleTableDefintion<T>(model: z.ZodType<T>, name: string | undefined): [any, string[]] {
    if (model instanceof z.ZodBoolean) {
        const decl = f.createCallExpression(
            f.createIdentifier('boolean'),
            undefined,
            [],
        );

        return [decl, ['boolean']];
    }

    throw new Error(`Unsupported model type: ${model.constructor.name}`);
}
