import { ExportedDeclarations, SyntaxKind } from 'ts-morph';

import { Model, createModelByType } from './model';
import { last } from 'lodash';

type ComputedConfig = {
    source:   string;
    computed: string;
    type:     Model;
    watcher:  string;
};

export function parseComputed(decl: ExportedDeclarations): ComputedConfig[] | undefined {
    if (!decl.isKind(SyntaxKind.TypeAliasDeclaration)) {
        return undefined;
    }

    const typeNode = decl.getTypeNode();

    if (typeNode == null || !typeNode.isKind(SyntaxKind.TypeReference)) {
        return undefined;
    }

    const name = typeNode.getTypeName().getText();

    if (name !== 'Computed') {
        return undefined;
    }

    const args = typeNode.getTypeArguments();

    const second = args[1];

    if (second == null || !second.isKind(SyntaxKind.TupleType)) {
        return undefined;
    }

    const elements = second.getElements();

    const result: ComputedConfig[] = [];

    for (const e of elements) {
        if (!e.isKind(SyntaxKind.TypeLiteral)) {
            return undefined;
        }

        const props = e.getProperties();

        const source = props.find(p => p.getName() === 'source');
        const computed = props.find(p => p.getName() === 'computed');
        const type = props.find(p => p.getName() === 'type');
        const watcher = props.find(p => p.getName() === 'watcher');

        if (source == null || computed == null || type == null || watcher == null) {
            return undefined;
        }

        if (!source.getType().isStringLiteral()
          || !computed.getType().isStringLiteral()
          || !watcher.getType().isStringLiteral()) {
            return undefined;
        }

        result.push({
            source:   source.getType().getLiteralValue() as string,
            computed: computed.getType().getLiteralValue() as string,
            type:     createModelByType(type.getType(), type.getTypeNode()!),
            watcher:  watcher.getType().getLiteralValue() as string,
        });
    }

    return result;
}

export function applyComputed(model: Model, computed: ComputedConfig[]): Model {
    for (const c of computed) {
        const { source, watcher } = c;

        const parts = source.split('.');

        let ref = model;

        for (const p of parts.slice(0, -1)) {
            while (ref.kind === 'array') {
                ref = ref.element;
            }

            if (ref.kind !== 'object') {
                throw new Error(`wrong computed index: ${source}`);
            }

            const item = ref.keyValues.find(kv => kv.key === p);

            if (item == null) {
                throw new Error(`wrong computed index: ${source}`);
            }

            ref = item.value;
        }

        while (ref.kind === 'array') {
            ref = ref.element;
        }

        if (ref.kind !== 'object') {
            throw new Error(`wrong computed index: ${source}`);
        }

        const sourceItem = ref.keyValues.find(v => v.key === last(parts));

        if (sourceItem == null) {
            throw new Error(`wrong computed index: ${source}`);
        }

        sourceItem.watcher = watcher;

        if (sourceItem.hasTrailingNewline) {
            sourceItem.hasTrailingNewline = false;

            const computedItem = ref.keyValues.find(v => v.key == c.computed);

            if (computedItem == null) {
                throw new Error(`wrong computed index: ${source}`);
            }

            computedItem.hasTrailingNewline = true;
        }

        const valueIndex: Record<string, number> = {};

        for (const [i, kv] of ref.keyValues.entries()) {
            valueIndex[kv.key] = i;
        }

        valueIndex[c.computed] = valueIndex[last(parts)!] + 0.5;

        ref.keyValues = ref.keyValues.sort((a, b) => valueIndex[a.key] - valueIndex[b.key]);
    }

    return model;
}
