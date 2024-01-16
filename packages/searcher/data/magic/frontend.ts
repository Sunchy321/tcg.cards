import { defineFrontendModel } from '../../src/model/frontend';
import { defineFrontendCommand, CommonFrontendCommand } from '../../src/command/frontend';

import * as builtin from '../../src/command/builtin/frontend';
// import * as magic from './command/frontend';

import model, { commands } from './index';

const raw = defineFrontendCommand({
    command: commands.raw,
    explain({ parameter }, i18n) {
        if (/^(\{[^}]+\})+$/.test(parameter)) {
            return i18n('$.full-command.raw-mana', { parameter });
        } else {
            return i18n('$.full-command.raw', { parameter });
        }
    },
});

const stats = defineFrontendCommand({
    command: commands.stats,
    explain({ pattern: { power, toughness } }, i18n) {
        return i18n('$.full-command.stats', { power, toughness });
    },
});

const hash = defineFrontendCommand({
    command: commands.hash,
    explain({ pattern:{ tag } }, i18n) {
        return i18n('$.full-command.hash', { tag });
    },
});

const set = defineFrontendCommand(commands.set);
const num = defineFrontendCommand(commands.num);
const lang = defineFrontendCommand(commands.lang);

const cost = defineFrontendCommand(commands.cost);
const manaValue = defineFrontendCommand(commands.manaValue);

const color = defineFrontendCommand(commands.color);
const colorIdentity = defineFrontendCommand(commands.colorIdentity);
const colorIndicator = defineFrontendCommand(commands.colorIndicator);

const power = defineFrontendCommand(commands.power);
const toughness = defineFrontendCommand(commands.toughness);

const loyalty = defineFrontendCommand({
    command: commands.loyalty,
    explain({ parameter, pattern, operator }, i18n) {
        const { id } = commands.loyalty;

        const commandText = i18n(`$.command.${id}`);

        const operatorText = i18n(`operator.${operator}`);

        const param = pattern?.loyalty ?? parameter;

        return `${commandText}${operatorText}${param}`;
    },
});

const defense = defineFrontendCommand({
    command: commands.defense,
    explain({ parameter, pattern, operator }, i18n) {
        const { id } = commands.defense;

        const commandText = i18n(`$.command.${id}`);

        const operatorText = i18n(`operator.${operator}`);

        const param = pattern?.defense ?? parameter;

        return `${commandText}${operatorText}${param}`;
    },
});

const name = builtin.text(commands.name);
const type = builtin.text(commands.type);
const text = builtin.text(commands.text);
const oracle = builtin.text(commands.oracle);

const flavorText = builtin.text(commands.flavorText);
const flavorName = builtin.text(commands.flavorName);
const layout = builtin.simple(commands.layout, { map: true });

const rarity = defineFrontendCommand(commands.rarity);
const date = defineFrontendCommand(commands.date);
const format = defineFrontendCommand(commands.format);

const counter = defineFrontendCommand(commands.counter);
const keyword = defineFrontendCommand(commands.keyword);

const order = defineFrontendCommand({
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

const frontendCommands: Record<string, CommonFrontendCommand> = {
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

export default defineFrontendModel({
    id:       model.id,
    commands: Object.values(frontendCommands),
});
