import { defineClientModel } from 'src/search';
import { defineClientCommand } from 'src/search/command';

import * as builtin from 'src/search/command/builtin';

import model, { commands } from '@model/omnisearch/search';

const raw = defineClientCommand({
    command: commands.raw,
    explain({ parameter }, i18n) {
        return i18n('$.full-command.raw', { parameter });
    },
});

const name = builtin.text(commands.name);
const type = builtin.text(commands.type);
const text = builtin.text(commands.text);

const order = defineClientCommand({
    command: commands.order,
    explain({ parameter }, i18n) {
        parameter = parameter.toLowerCase();

        const [type, dir] = ((): [string, -1 | 0 | 1] => {
            if (parameter.endsWith('+')) {
                return [parameter.slice(0, -1), 1];
            }

            if (parameter.endsWith('-')) {
                return [parameter.slice(0, -1), -1];
            }

            return [parameter, 0];
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
    },
});

export default defineClientModel({
    id:       model.id,
    commands: [
        raw,
        name,
        type,
        text,
        order,
    ],
});
