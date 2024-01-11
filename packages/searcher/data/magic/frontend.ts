import { defineFrontendModel } from '../../src/model/frontend';
import { defineFrontendCommand, CommonFrontendCommand } from '../../src/command/frontend';

import model, { commands } from './index';

const raw = defineFrontendCommand({
    command: commands.raw,
    explain({ parameter }, i18n) {
        if (/^(\{[^}]+\})+$/.test(parameter)) {
            return i18n('magic.full-command.raw-mana', { parameter });
        } else {
            return i18n('magic.full-command.raw', { parameter });
        }
    },
});

const stats = defineFrontendCommand({
    command: commands.stats,
    explain({ pattern: { power, toughness } }, i18n) {
        return i18n('magic.full-command.stats', { power, toughness });
    },
});

const hash = defineFrontendCommand({
    command: commands.hash,
    explain({ pattern:{ tag } }, i18n) {
        return i18n('magic.full-command.hash', { tag });
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

        const commandText = i18n(`${model.id}.command.${id}`);

        const operatorText = i18n(`operator.${operator}`);

        const param = pattern?.loyalty ?? parameter;

        return `${commandText}${operatorText}${param}`;
    },
});

const defense = defineFrontendCommand({
    command: commands.defense,
    explain({ parameter, pattern, operator }, i18n) {
        const { id } = commands.defense;

        const commandText = i18n(`${model.id}.command.${id}`);

        const operatorText = i18n(`operator.${operator}`);

        const param = pattern?.defense ?? parameter;

        return `${commandText}${operatorText}${param}`;
    },
});

const name = defineFrontendCommand(commands.name);
const type = defineFrontendCommand(commands.type);
const text = defineFrontendCommand(commands.text);
const oracle = defineFrontendCommand(commands.oracle);

const flavorText = defineFrontendCommand(commands.flavorText);
const flavorName = defineFrontendCommand(commands.flavorName);
const layout = defineFrontendCommand(commands.layout);

const rarity = defineFrontendCommand(commands.rarity);
const format = defineFrontendCommand(commands.format);

const counter = defineFrontendCommand(commands.counter);
const keyword = defineFrontendCommand(commands.keyword);
const order = defineFrontendCommand(commands.order);

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
    format,
    counter,
    keyword,
    order,
};

export default defineFrontendModel({
    id:       model.id,
    commands: Object.values(frontendCommands),
});
