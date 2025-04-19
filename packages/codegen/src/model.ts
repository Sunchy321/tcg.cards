import { InterfaceDeclaration, SyntaxKind, Type, TypeAliasDeclaration } from 'ts-morph';

import * as fs from 'fs';
import { last } from 'lodash';

type Primitive = {
    kind: 'primitive';
    type: 'string' | 'number' | 'any' | 'boolean';
};

type Optional = {
    kind:     'optional';
    baseType: Model;
};

type ElementArray = {
    kind:    'array';
    element: Model;
};

type SimpleSet = {
    kind:    'simpleSet';
    element: Model;
};

type Enum = {
    kind:   'enum';
    values: string[];
};

type Union = {
    kind:    'union';
    members: Model[];
};

type StringMap = {
    kind:  'string-map';
    value: Model;
};

type Object = {
    kind:      'object';
    keyValues: {
        key:                   string;
        value:                 Model;
        hasTrailingEmptyLine?: boolean;
    }[];
};

type Unknown = {
    kind: 'unknown';
    text: string;
};

export type Model = Primitive | ElementArray | Optional | SimpleSet | StringMap | Enum | Object | Union | Unknown;

function isStringLiteral(type: Type): boolean {
    return type.isStringLiteral() || type.isTemplateLiteral();
}

function createModelByType(type: Type): Model {
    if (type.isNever()) {
        throw new Error('never should not appear in a model');
    }

    if (type.isNullable()) {
        return {
            kind:     'optional',
            baseType: createModelByType(type.getNonNullableType()),
        };
    }

    if (type.isAny()) {
        return {
            kind: 'primitive',
            type: 'any',
        };
    }

    if (type.isNumber()) {
        return {
            kind: 'primitive',
            type: 'number',
        };
    }

    if (type.isString()) {
        return {
            kind: 'primitive',
            type: 'string',
        };
    }

    if (type.isBoolean()) {
        return {
            kind: 'primitive',
            type: 'boolean',
        };
    }

    if (type.isArray()) {
        return {
            kind:    'array',
            element: createModelByType(type.getArrayElementType()!),
        };
    }

    if (type.getStringIndexType() != null) {
        return {
            kind:  'string-map',
            value: createModelByType(type.getStringIndexType()!),
        };
    }

    if (isStringLiteral(type)) {
        return {
            kind:   'enum',
            values: [type.getLiteralValue() as string],
        };
    }

    if (type.isUnion()) {
        const types = type.getUnionTypes();

        if (types.every(t => isStringLiteral(t))) {
            return {
                kind:   'enum',
                values: types.map(t => t.getLiteralValue() as string),
            };
        } else {
            return {
                kind:    'union',
                members: types.map(t => createModelByType(t)),
            };
        }
    }

    if (type.getProperties().length > 0) {
        const lines = type.getProperties().map(p => {
            const decl = p.getValueDeclaration()!;

            return [decl.getStartLineNumber(), decl.getEndLineNumber()];
        });

        return {
            kind:      'object',
            keyValues: type.getProperties().map((p, i, a) => ({
                key:                  p.getName(),
                value:                createModelByType(p.getValueDeclarationOrThrow().getType()),
                hasTrailingEmptyLine: i === a.length - 1
                    ? false
                    : lines[i + 1][0] - lines[i][1] > 1,
            })),
        };
    }

    throw new Error(`unknown type ${type.getText()}`);
}

export function createModel(declaration: TypeAliasDeclaration | InterfaceDeclaration): Model {
    if (declaration.isKind(SyntaxKind.TypeAliasDeclaration)) {
        return createModelByType(declaration.getType());
    } else {
        const properties = declaration.getProperties();

        const lines = properties.map(p => {
            return [p.getStartLineNumber(), p.getEndLineNumber()];
        });

        return {
            kind:      'object',
            keyValues: properties.map((p, i, a) => ({
                key:                  p.getName(),
                value:                createModelByType(p.getType()),
                hasTrailingEmptyLine: i === a.length - 1
                    ? false
                    : lines[i + 1][0] - lines[i][1] > 1,
            })),
        };
    }
}

export function writeModel(model: Model, path: string): void {
    fs.writeFileSync(path, JSON.stringify(model, null, 4));
}

export function modelIntoSchema(model: Model, ignoreId = false): string {
    switch (model.kind) {
    case 'primitive':
        switch (model.type) {
        case 'boolean':
            return 'Boolean';
        case 'string':
            return 'String';
        case 'number':
            return 'Number';
        case 'any':
            return 'Object';
        default:
            throw new Error(`Unknown primitive ${model.type}`);
        }
    case 'optional':
        if (model.baseType.kind === 'array') {
            return `{ $type: ${modelIntoSchema(model.baseType)}, default: undefined }`;
        } else {
            return modelIntoSchema(model.baseType);
        }
    case 'array':
    case 'simpleSet':
        return '[' + modelIntoSchema(model.element, true) + ']';
    case 'enum':
        return 'String';
    case 'union':
        return 'Object';
    case 'string-map':
        return 'Object';
    case 'object': {
        const items = [...model.keyValues.map(kv => ({
            key:                  kv.key,
            value:                modelIntoSchema(kv.value),
            hasTrailingEmptyLine: kv.hasTrailingEmptyLine,
        }))];

        if (ignoreId) {
            items.unshift({ key: '_id', value: 'false', hasTrailingEmptyLine: true });
        }

        if (last(items) != null) {
            last(items)!.hasTrailingEmptyLine = true;
        }

        return `{\n${items.map((v, i, a) => {
            let text = `${v.key}: ${v.value},`;

            if (i !== a.length - 1) {
                text += '\n';
            }

            if (v.hasTrailingEmptyLine) {
                text += '\n';
            }

            return text;
        }).join('')}}`;
    }
    default:
        throw new Error(`Unknown kind ${model.kind}`);
    }
}
