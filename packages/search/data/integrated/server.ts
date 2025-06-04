import { defineServerModel } from '../../src/model/server';
import { defineServerCommand, DBQuery, CommonServerCommand } from '../../src/command/server';

import { Model } from 'mongoose';

import { PostAction } from '../../src/model/type';
import { SearchOption } from '../../src/search';
import { QueryError } from '../../src/command/error';

import * as builtin from '../../src/command/builtin/server';

import { ICardDatabase } from '@common/model/integrated/card';
import { IPrintDatabase } from '@common/model/integrated/print';

import { commands } from './index';

const raw = defineServerCommand({
    command: commands.raw,
    query:   ({ parameter }) => {
        return {
            $or: [
                builtin.text.query({
                    key:       'name',
                    multiline: false,
                    parameter,
                    operator:  ':',
                    qualifier: [],
                }),
                builtin.text.query({
                    key:       'localization.name',
                    multiline: false,
                    parameter,
                    operator:  ':',
                    qualifier: [],
                }),
            ],
        };
    },
});

const name = defineServerCommand({
    command: commands.name,
    query({
        parameter, operator, qualifier,
    }) {
        return {
            [!qualifier.includes('!') ? '$or' : '$and']: [
                builtin.text.query({
                    key: 'name', parameter, operator, qualifier,
                }),
                builtin.text.query({
                    key: 'localization.name', parameter, operator, qualifier,
                }),
            ],
        };
    },
});

const type = defineServerCommand({
    command: commands.type,
    query({
        parameter, operator, qualifier,
    }) {
        return {
            [!qualifier.includes('!') ? '$or' : '$and']: [
                builtin.text.query({
                    key: 'typeline', parameter, operator, qualifier,
                }),
                builtin.text.query({
                    key: 'localization.typeline', parameter, operator, qualifier,
                }),
            ],
        };
    },
});

const text = defineServerCommand({
    command: commands.text,
    query({
        parameter, operator, qualifier,
    }) {
        return {
            [!qualifier.includes('!') ? '$or' : '$and']: [
                builtin.text.query({
                    key: 'text', parameter, operator, qualifier,
                }),
                builtin.text.query({
                    key: 'localization.text', parameter, operator, qualifier,
                }),

            ],
        };
    },
});

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
            case 'name':
                agg.sort({ name: dir });
                break;
            case 'id':
                agg.sort({ cardId: dir });
                break;
            case 'game':
                agg.sort({ game: dir });
                break;
            default:
                throw new QueryError({ type: 'invalid-query' });
            }
        };
    },
});

const backedCommands: Record<string, CommonServerCommand> = {
    raw,
    name,
    type,
    text,
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

type ServerModel = {
    card:  ICardDatabase;
    print: IPrintDatabase;
};

type ServerActions = {
    search:   { cards: ServerModel[], total: number, page: number };
    dev:      { cards: ServerModel[], total: number };
    searchId: string[];
};

export default defineServerModel<ServerActions, Model<ICardDatabase>>({
    commands: Object.values(backedCommands),

    actions: {
        search: async (gen, q: DBQuery, p: PostAction[], o: SearchOption) => {
            const orderBy = o['order-by'] ?? 'id+';
            const page = parseOption(o.page, 1);
            const pageSize = parseOption(o['page-size'], 100);
            const locale = o.locale ?? 'en';

            const start = Date.now();

            const fullGen = <T>() => {
                const aggregate = gen<T>();

                aggregate
                    .collation({ locale: 'en', numericOrdering: true })
                    .allowDiskUse(true)
                    .unwind('localization')
                    .match(q)
                    .addFields({
                        langIsLocale: { $eq: ['$localization.lang', locale] },
                    })
                    .group({
                        _id:   { game: '$game', cardId: '$cardId' },
                        value: {
                            $top: {
                                sortBy: {
                                    langIsLocale: -1,
                                },

                                output: '$$ROOT',
                            },
                        } as any,
                    })
                    .replaceRoot('$value');

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
                    _id:           0,
                    __v:           0,
                    __updations:   0,
                    __lockedPaths: 0,
                    langIsLocale:  0,
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

        dev: async (gen, q: DBQuery, p: PostAction[], o: SearchOption) => {
            const fullGen = <T>() => {
                const aggregate = gen<T>();

                aggregate
                    .allowDiskUse(true)
                    .match(q);

                return aggregate;
            };

            const total = (
                await fullGen<{ count: number }>()
                    .group({ _id: null, count: { $sum: 1 } })
            )[0]?.count ?? 0;

            const cards = await fullGen<ServerModel>()
                .sort({ cardId: 1 })
                .limit(o.sample);

            return {
                cards,
                total,
            };
        },

        searchId: async (generator, q: DBQuery) => {
            const result = await generator<{ _id: string }>()
                .allowDiskUse(true)
                .match(q)
                .group({ _id: { game: '$game', cardId: '$cardId' } });

            return result.map(v => v._id) as string[];
        },
    },
}, card => ({
    search: <V> () => card.aggregate<V>(),

    dev: <V>() => card.aggregate<V>()
        .replaceRoot({ card: '$$ROOT' })
        .lookup({
            from:         'prints',
            as:           'print',
            localField:   'card.cardId',
            foreignField: 'cardId',
        }),

    searchId: <V>() => card.aggregate<V>()
        .lookup({
            from:         'prints',
            as:           'print',
            localField:   'cardId',
            foreignField: 'cardId',
        }),
}));
