import { Model } from './model';

import { last } from 'lodash';

type Primitive = {
    kind: 'primitive';
    type: 'string' | 'number' | 'object' | 'boolean' | 'false';
};

type ElementArray = {
    kind:    'array';
    element: Schema;
};

type Object = {
    kind:      'object';
    keyValues: {
        key:                 string;
        value:               Schema;
        hasTrailingNewline?: boolean;
    }[];
};

type Type = Primitive | ElementArray | Object;

type Schema = Type & {
    default?: string | null;
    watcher?: string;
};

type SchemaOptions = {
    ignoreId?: boolean;
};

export function modelIntoSchema(model: Model, options: SchemaOptions = {}): Schema {
    const { ignoreId = false } = options;

    switch (model.kind) {
    case 'primitive':
        switch (model.type) {
        case 'boolean':
            return { kind: 'primitive', type: 'boolean' };
        case 'string':
            return { kind: 'primitive', type: 'string' };
        case 'number':
            return { kind: 'primitive', type: 'number' };
        case 'any':
            return { kind: 'primitive', type: 'object' };
        default:
            throw new Error(`Unknown primitive ${model.type}`);
        }
    case 'optional':
        if (model.baseType.kind === 'array') {
            const baseSchema = modelIntoSchema(model.baseType, options);

            baseSchema.default = null;

            return baseSchema;
        } else {
            return modelIntoSchema(model.baseType, options);
        }
    case 'array':
    case 'simpleSet':
        return {
            kind:    'array',
            element: modelIntoSchema(model.element, { ignoreId: true }),
        };
    case 'enum':
        return { kind: 'primitive', type: 'string' };
    case 'union':
    case 'string-map':
        return { kind: 'primitive', type: 'object' };
    case 'object': {
        const items = [...model.keyValues.map(kv => ({
            key:                kv.key,
            value:              modelIntoSchema(kv.value),
            hasTrailingNewline: kv.hasTrailingNewline,
            watcher:            kv.watcher,
        }))];

        if (ignoreId) {
            items.unshift({
                key:                '_id',
                value:              { kind: 'primitive', type: 'false' },
                hasTrailingNewline: true,
                watcher:            undefined,
            });
        }

        if (last(items) != null) {
            last(items)!.hasTrailingNewline = true;
        }

        return {
            kind:      'object',
            keyValues: items.map(v => {
                const result = { key: v.key, value: v.value, hasTrailingNewline: v.hasTrailingNewline };

                if (v.watcher != null) {
                    result.value.watcher = v.watcher;
                }

                return result;
            }),
        };
    }
    default:
        throw new Error(`Unknown kind ${model.kind}`);
    }
}

function printPrimitive(value: Primitive['type']): string {
    switch (value) {
    case 'false' : return 'false';
    case 'boolean': return 'Boolean';
    case 'string': return 'String';
    case 'number': return 'Number';
    case 'object': return 'Object';
    default: throw new Error(`Unknown primitive ${value}`);
    }
}

function printBaseSchema(
    type: string,
    defaultValue: string | null | undefined,
    watcher: string | undefined,
    newLine = false,
): string {
    const newLineChar = newLine ? '\n' : '';

    if (defaultValue === undefined) {
        if (watcher === undefined) {
            return type;
        } else {
            return `{ ${newLineChar} $type: ${type}, ${newLineChar} watcher: ${watcher} ${newLineChar} }`;
        }
    } else {
        if (watcher === undefined) {
            return `{ ${newLineChar} $type: ${type}, ${newLineChar} default: ${defaultValue === null ? 'undefined' : defaultValue} ${newLineChar} }`;
        } else {
            return `{ ${newLineChar} $type: ${type}, ${newLineChar} default: ${defaultValue === null ? 'undefined' : defaultValue}, watcher: ${watcher} ${newLineChar} }`;
        }
    }
}

export function printSchema(schema: Schema): string {
    switch (schema.kind) {
    case 'primitive':
        return printBaseSchema(printPrimitive(schema.type), schema.default, schema.watcher);
    case 'array':
        return printBaseSchema(`[${printSchema(schema.element)}]`, schema.default, schema.watcher);
    case 'object': {
        const type = `{\n${schema.keyValues.map((v, i, a) => {
            let text = `${v.key}: ${printSchema(v.value)},`;

            if (i !== a.length - 1) {
                text += '\n';
            }

            if (v.hasTrailingNewline) {
                text += '\n';
            }

            return text;
        }).join('')}}`;

        return printBaseSchema(type, schema.default, schema.watcher, true);
    }
    }
}
