import { defineClientModel } from '../../src/model/client';
import { defineClientCommand, CommonClientCommand } from '../../src/command/client';

import * as builtin from '../../src/command/builtin/client';

import model, { commands } from './index';

import { defaultTranslate } from '../../src/model/client/translate';

import { textMap } from '../../src/command/builtin/text/client';

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
    explain({ pattern: { power, toughness } }, i18n) {
        return i18n('$.full-command.stats', { power, toughness });
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
const manaValue = defineClientCommand(commands.manaValue);

const color = defineClientCommand(commands.color);
const colorIdentity = defineClientCommand(commands.colorIdentity);
const colorIndicator = defineClientCommand(commands.colorIndicator);

const power = defineClientCommand(commands.power);
const toughness = defineClientCommand(commands.toughness);

const loyalty = defineClientCommand({
    command: commands.loyalty,
    explain({ parameter, pattern, operator }, i18n) {
        const { id } = commands.loyalty;

        return defaultTranslate({
            operator,
            qualifier: [],
            parameter: pattern?.loyalty ?? parameter,
        }, i18n, id, textMap);
    },
});

const defense = defineClientCommand({
    command: commands.defense,
    explain({ parameter, pattern, operator }, i18n) {
        const { id } = commands.defense;

        return defaultTranslate({
            operator,
            qualifier: [],
            parameter: pattern?.defense ?? parameter,
        }, i18n, id, textMap);
    },
});

const name = builtin.text(commands.name);
const type = builtin.text(commands.type);
const text = builtin.text(commands.text);
const oracle = builtin.text(commands.oracle);

const flavorText = builtin.text(commands.flavorText);
const flavorName = builtin.text(commands.flavorName);
const layout = builtin.simple(commands.layout, { map: true });

const rarity = defineClientCommand(commands.rarity);
const date = defineClientCommand(commands.date);
const format = defineClientCommand(commands.format);

const counter = defineClientCommand(commands.counter);
const keyword = defineClientCommand(commands.keyword);

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

const clientCommands: Record<string, CommonClientCommand> = {
    raw,
    stats,
    hash,
    set,
    num,
    lang,
    cost,
    manaValue,
    color,
    colorIdentity,
    colorIndicator,
    power,
    toughness,
    loyalty,
    defense,
    name,
    type,
    text,
    oracle,
    flavorText,
    flavorName,
    layout,
    rarity,
    date,
    format,
    counter,
    keyword,
    order,
};

export default defineClientModel({
    id:       model.id,
    commands: Object.values(clientCommands),
});
