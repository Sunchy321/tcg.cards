import { defineClientModel } from '../../src/model/client';
import { defineClientCommand, CommonClientCommand } from '../../src/command/client';

import * as builtin from '../../src/command/builtin/client';

import model, { commands } from './index';

const raw = defineClientCommand({
    command: commands.raw,
    explain({ parameter }, i18n) {
        if (typeof parameter === 'string' && /^(\{[^}]+\})+$/.test(parameter)) {
            return i18n('$.full-command.raw-mana', { parameter });
        } else {
            return i18n('$.full-command.raw', { parameter });
        }
    },
});

const stats = defineClientCommand({
    command: commands.stats,
    explain({ pattern: { strength, willPower } }, i18n) {
        return i18n('$.full-command.stats', { strength, willPower });
    },
});

const fullStats = defineClientCommand({
    command: commands.fullStats,
    explain({ pattern: { cost, strength, willPower } }, i18n) {
        return i18n('$.full-command.full-stats', { cost, strength, willPower });
    },
});

const hash = defineClientCommand({
    command: commands.hash,
    explain({ pattern:{ tag } }, i18n) {
        return i18n('$.full-command.hash', { tag });
    },
});

const set = defineClientCommand(commands.set);
const num = defineClientCommand(commands.num);
const lang = defineClientCommand(commands.lang);

const cost = defineClientCommand(commands.cost);

const color = defineClientCommand(commands.color);

const lore = defineClientCommand(commands.lore);
const strength = defineClientCommand(commands.strength);
const willPower = defineClientCommand(commands.willPower);
const moveCost = defineClientCommand(commands.moveCost);

const name = builtin.text(commands.name);
const type = builtin.text(commands.type);
const text = builtin.text(commands.text);

const flavorText = builtin.text(commands.flavorText);
const layout = builtin.simple(commands.layout, { map: true });

const rarity = defineClientCommand(commands.rarity);

const order = defineClientCommand({
    command: commands.order,
    explain({ parameter }, i18n) {
        parameter = parameter.toLowerCase();

        // eslint-disable-next-line @typescript-eslint/no-shadow
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

const clientCommands: Record<string, CommonClientCommand> = {
    raw,
    stats,
    fullStats,
    hash,
    set,
    num,
    lang,
    cost,
    color,
    lore,
    strength,
    willPower,
    moveCost,
    name,
    type,
    text,
    flavorText,
    layout,
    rarity,
    order,
};

export default defineClientModel({
    id:       model.id,
    commands: Object.values(clientCommands),
});
