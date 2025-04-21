import { InterfaceDeclaration, SyntaxKind, Type, TypeAliasDeclaration, Node } from 'ts-morph';

import * as fs from 'fs';

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
        key:                 string;
        value:               Model;
        hasTrailingNewline?: boolean;
        watcher?:            string;
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

export function createModelByType(type: Type, node: Node): Model {
    if (type.isNever()) {
        throw new Error('never should not appear in a model');
    }

    if (type.isNullable()) {
        return {
            kind:     'optional',
            baseType: createModelByType(type.getNonNullableType(), node),
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
            element: createModelByType(type.getArrayElementType()!, node),
        };
    }

    if (type.getStringIndexType() != null) {
        return {
            kind:  'string-map',
            value: createModelByType(type.getStringIndexType()!, node),
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
                members: types.map(t => createModelByType(t, node)),
            };
        }
    }

    if (type.getProperties().length > 0) {
        const lines = type.getProperties().map(p => {
            const decl = p.getValueDeclaration() ?? p.getDeclarations()[0];

            return [decl?.getStartLineNumber() ?? 0, decl?.getEndLineNumber() ?? 0];
        });

        return {
            kind:      'object',
            keyValues: type.getProperties().map((p, i, a) => {
                return {
                    key:                p.getName(),
                    value:              createModelByType(p.getTypeAtLocation(node), node),
                    hasTrailingNewline: i === a.length - 1
                        ? false
                        : lines[i + 1][0] - lines[i][1] > 1,
                };
            }),
        };
    }

    throw new Error(`unknown type ${type.getText()}`);
}

export function createModel(declaration: TypeAliasDeclaration | InterfaceDeclaration): Model {
    if (declaration.isKind(SyntaxKind.TypeAliasDeclaration)) {
        return createModelByType(declaration.getType(), declaration.getTypeNode()!);
    } else {
        const properties = declaration.getProperties();

        const lines = properties.map(p => {
            return [p.getStartLineNumber(), p.getEndLineNumber()];
        });

        return {
            kind:      'object',
            keyValues: properties.map((p, i, a) => ({
                key:                p.getName(),
                value:              createModelByType(p.getType(), p.getTypeNode()!),
                hasTrailingNewline: i === a.length - 1
                    ? false
                    : lines[i + 1][0] - lines[i][1] > 1,
            })),
        };
    }
}

export function writeModel(model: Model, path: string): void {
    fs.writeFileSync(path, JSON.stringify(model, null, 4));
}
