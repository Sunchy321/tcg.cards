import { cc as create } from '../../command/builder';

import * as builtin from '../../command/builtin';

import { model } from '@model/omnisearch/search';

const cc = create
    .with(model)
    .use({ ...builtin });

export const raw = cc
    .commands.raw
    .explain((args, i18n) => {
        const { value } = args;
        return i18n('$.full-command.raw', { parameter: value });
    });

export const name = cc
    .commands.name
    .apply({ id: 'name' });

export const type = cc
    .commands.type
    .apply({ id: 'type' });

export const text = cc
    .commands.text
    .apply({ id: 'text' });

export const order = cc
    .commands.order
    .explain((args, i18n) => {
        let { value } = args;

        if (typeof value !== 'string') {
            return undefined;
        }

        value = value.toLowerCase();

        const [type, dir] = ((): [string, -1 | 0 | 1] => {
            if (value.endsWith('+')) {
                return [value.slice(0, -1), 1];
            }

            if (value.endsWith('-')) {
                return [value.slice(0, -1), -1];
            }

            return [value, 0];
        })();

        const realType = (() => {
            switch (type) {
            case 'name':
                return 'name';
            case 'date':
                return 'date';
            case 'id':
                return 'id';
            case 'cmc':
            case 'mv':
            case 'cost':
                return 'cost';
            default:
                return type;
            }
        })();

        const commandKey = dir === 0 ? 'order' : dir === 1 ? 'order-ascending' : 'order-descending';

        return i18n(`$.full-command.${commandKey}`, { parameter: i18n(`$.parameter.order.${realType}`) });
    });
