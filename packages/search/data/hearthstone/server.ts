import { defineServerModel } from '../../src/model/server';
import { defineServerCommand, DBQuery, CommonServerCommand } from '../../src/command/server';

import { Model } from 'mongoose';

import { PostAction } from '../../src/model/type';
import { SearchOption } from '../../src/search';
import { QueryError } from '../../src/command/error';

import { Entity as IEntity } from '@interface/hearthstone/entity';

import * as builtin from '../../src/command/builtin/server';

import { escapeRegExp } from 'lodash';

import { commands } from './index';

const raw = defineServerCommand({
    command: commands.raw,
    query:   ({ parameter }) => ({
        $or: [
            builtin.text.query({
                key:       'localization.name',
                multiline: false,
                parameter,
                operator:  ':',
                qualifier: [],
            }),
            builtin.text.query({
                key:       'localization.text',
                multiline: false,
                parameter,
                operator:  ':',
                qualifier: [],
            }),
        ],
    }),
});

const fullStats = defineServerCommand({
    command: commands.fullStats,

    query({ pattern, operator, qualifier }) {
        if (pattern == null) {
            throw new QueryError({ type: 'invalid-query' });
        }

        if (operator === '' || operator === ':') {
            operator = '=';
        }

        const { cost, attack, health } = pattern;

        if (qualifier?.includes('!')) {
            return {
                $or: [
                    builtin.number.query({
                        key:       'cost',
                        parameter: cost,
                        operator:  operator ?? '=',
                        qualifier,
                        meta:      { allowFloat: false },
                    }),
                    builtin.number.query({
                        key:       'attack',
                        parameter: attack,
                        operator:  operator ?? '=',
                        qualifier,
                        meta:      { allowFloat: false },
                    }),
                    builtin.number.query({
                        key:       'health',
                        parameter: health,
                        operator:  operator ?? '=',
                        qualifier,
                        meta:      { allowFloat: false },
                    }),
                ],
            };
        } else {
            return {
                ...builtin.number.query({
                    key:       'cost',
                    parameter: cost,
                    operator:  operator ?? '=',
                    qualifier,
                    meta:      { allowFloat: false },
                }),
                ...builtin.number.query({
                    key:       'attack',
                    parameter: attack,
                    operator:  operator ?? '=',
                    qualifier,
                    meta:      { allowFloat: false },
                }),
                ...builtin.number.query({
                    key:       'health',
                    parameter: health,
                    operator:  operator ?? '=',
                    qualifier,
                    meta:      { allowFloat: false },
                }),
            };
        }
    },
});

const stats = defineServerCommand({
    command: commands.stats,

    query({ pattern, operator, qualifier }) {
        if (pattern == null) {
            throw new QueryError({ type: 'invalid-query' });
        }

        if (operator === '' || operator === ':') {
            operator = '=';
        }

        const { attack, health } = pattern;

        if (qualifier?.includes('!')) {
            return {
                $or: [
                    builtin.number.query({
                        key:       'attack',
                        parameter: attack,
                        operator:  operator ?? '=',
                        qualifier,
                        meta:      { allowFloat: false },
                    }),
                    builtin.number.query({
                        key:       'health',
                        parameter: health,
                        operator:  operator ?? '=',
                        qualifier,
                        meta:      { allowFloat: false },
                    }),
                ],
            };
        } else {
            return {
                ...builtin.number.query({
                    key:       'attack',
                    parameter: attack,
                    operator:  operator ?? '=',
                    qualifier,
                    meta:      { allowFloat: false },
                }),
                ...builtin.number.query({
                    key:       'health',
                    parameter: health,
                    operator:  operator ?? '=',
                    qualifier,
                    meta:      { allowFloat: false },
                }),
            };
        }
    },
});

const hash = defineServerCommand({
    command: commands.hash,
    query({ pattern, qualifier }) {
        if (pattern == null) {
            throw new QueryError({ type: 'invalid-query' });
        }

        const { tag } = pattern;

        const match = /^(.*?)[:=](.*)$/.exec(tag);

        const tester = match == null
            ? new RegExp(`^${escapeRegExp(tag)}(?:$|:)`)
            : new RegExp(`^${escapeRegExp(match[1])}:${escapeRegExp(match[2])}$`);

        if (!qualifier.includes('!')) {
            return {
                $or: [
                    { mechanics: tester },
                    { referencedTags: tester },
                ],
            };
        } else {
            return {
                $and: [
                    { mechanics: { $ne: tester } },
                    { referencedTags: { $ne: tester } },
                ],
            };
        }
    },
});

const name = builtin.text(commands.name, { key: 'localization.name' });
const text = builtin.text(commands.text, { key: 'localization.text' });

const flavorText = builtin.text(commands.flavorText, { key: 'flavor' });

const set = builtin.simple(commands.set, { key: 'set' });

const classes = builtin.simpleSet(commands.classes, { key: 'classes' });
const type = builtin.simple(commands.type, { key: 'type' });
const cost = builtin.number(commands.cost, { key: 'cost' });
const attack = builtin.number(commands.attack, { key: 'attack' });
const health = builtin.number(commands.health, { key: 'health' });
const durability = builtin.number(commands.durability, { key: 'durability' });
const armor = builtin.number(commands.armor, { key: 'armor' });

const rune = builtin.simpleSet(commands.rune, { key: 'rune' });
const race = builtin.simple(commands.race, { key: 'race' });
const spellSchool = builtin.simple(commands.spellSchool, { key: 'spellSchool' });

const techLevel = builtin.number(commands.techLevel, { key: 'techLevel' });
const raceBucket = builtin.simple(commands.raceBucket, { key: 'raceBucket' });

const mercenaryRole = builtin.simple(commands.mercenaryRole, { key: 'mercenaryRole' });
const mercenaryFaction = builtin.simple(commands.mercenaryFaction, { key: 'mercenaryFaction' });

const rarity = builtin.simple(commands.rarity, { key: 'rarity' });

const artist = builtin.text(commands.artist, { key: 'artist' });

const order = defineServerCommand({
    command: commands.order,
    query() {},
    phase:   'order',
    post:    ({ parameter }) => {
        parameter = parameter.toLowerCase();

        const [type, dir] = ((): [string, -1 | 1] => {
            if (parameter.endsWith('+')) {
                return [parameter.slice(0, -1), 1];
            }

            if (parameter.endsWith('-')) {
                return [parameter.slice(0, -1), -1];
            }

            return [parameter, 1];
        })();

        return agg => {
            switch (type) {
            case 'set':
                agg.sort({ set: dir });
                break;
            case 'id':
                agg.sort({ dbfId: dir });
                break;
            case 'cost':
                agg.sort({ cost: dir });
                break;
            default:
                throw new QueryError({ type: 'invalid-query' });
            }
        };
    },
});

const backedCommands: Record<string, CommonServerCommand> = {
    raw,
    fullStats,
    stats,
    hash,
    name,
    text,
    flavorText,
    set,
    classes,
    type,
    cost,
    attack,
    health,
    durability,
    armor,
    rune,
    race,
    spellSchool,
    techLevel,
    raceBucket,
    mercenaryRole,
    mercenaryFaction,
    rarity,
    artist,
    order,
};

function parseOption(optionText: string | undefined, defaultValue: number): number {
    if (optionText == null) {
        return defaultValue;
    }

    const optionNumber = Number.parseInt(optionText, 10);

    if (Number.isNaN(optionNumber)) {
        return defaultValue;
    }

    return optionNumber;
}

type ServerModel = IEntity;

type ServerActions = {
    search: { cards: ServerModel[], total: number, page: number };
};

export default defineServerModel<ServerActions, Model<IEntity>>({
    commands: Object.values(backedCommands),

    actions: {
        search: async (gen, q: DBQuery, p: PostAction[], o: SearchOption) => {
            const orderBy = o['order-by'] ?? 'id+';
            const page = parseOption(o.page, 1);
            const pageSize = parseOption(o['page-size'], 100);

            const start = Date.now();

            const fullGen = <T>() => {
                const aggregate = gen<T>();

                aggregate
                    .collation({ locale: 'en', numericOrdering: true })
                    .allowDiskUse(true)
                    .match({ isCurrent: true, type: { $ne: 'enchantment' } })
                    .match(q);

                return aggregate;
            };

            const aggregate = fullGen<ServerModel>();

            const total = (
                await fullGen<{ count: number }>()
                    .group({ _id: null, count: { $sum: 1 } })
            )[0]?.count ?? 0;

            const countElapsed = Date.now() - start;

            const orderAction = p.find(v => v.phase === 'order');

            if (orderAction != null) {
                orderAction.action(aggregate);
            } else {
                order.post!({ parameter: orderBy, operator: ':', qualifier: [] })(aggregate);
            }

            aggregate
                .skip((page - 1) * pageSize)
                .limit(pageSize)
                .project({
                    _id: 0,
                    __v: 0,
                });

            // const explain = await aggregate.explain('executionStats');

            const cards = await aggregate;

            return {
                countElapsed,
                elapsed: Date.now() - start,
                total,
                page,
                // explain,
                cards,
            };
        },
    },
}, entity => ({
    search: <V> () => entity.aggregate<V>(),
}));
