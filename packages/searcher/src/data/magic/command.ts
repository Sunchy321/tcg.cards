import {
    allOperator, createCommand, defaultOperator, defaultQualifier,
} from '../../command';
import { QueryError } from '../../command/error';

import * as builtin from '../../preset/builtin';
import * as magic from './preset';

import { deburr } from 'lodash';
import matchPattern from '../../command/match-pattern';

function toIdentifier(text: string): string {
    return deburr(text)
        .trim()
        .toLowerCase()
        .replace(' // ', '____')
        .replace('/', '____')
        .replace(/[^a-z0-9]/g, '_');
}

export default {
    default: createCommand({
        id:    '!default',
        query: ({ parameter }) => {
            // search mana
            if (/^(\{[^}]+\})+$/.test(parameter)) {
                return {
                    $or: [
                        builtin.text.query({
                            key:       'parts.oracle.text',
                            multiline: false,
                            parameter,
                            operator:  ':',
                            qualifier: [],
                        }),
                        builtin.text.query({
                            key:       'parts.unified.text',
                            multiline: false,
                            parameter,
                            operator:  ':',
                            qualifier: [],
                        }),
                        builtin.text.query({
                            key:       'parts.printed.text',
                            multiline: false,
                            parameter,
                            operator:  ':',
                            qualifier: [],
                        }),
                        magic.cost.query({
                            parameter,
                            operator:  ':',
                            qualifier: [],
                        }),
                    ],
                };
            } else {
                return {
                    $or: [
                        builtin.text.query({
                            key:       'parts.oracle.name',
                            multiline: false,
                            parameter,
                            operator:  ':',
                            qualifier: [],
                        }),
                        builtin.text.query({
                            key:       'parts.unified.name',
                            multiline: false,
                            parameter,
                            operator:  ':',
                            qualifier: [],
                        }),
                    ],
                };
            }
        },
    }),

    hash: createCommand({
        id:         '!hash',
        pattern:    '#{{tag}}',
        qualifiers: defaultQualifier,
        query({ parameter, qualifier }, { pattern }) {
            const { tag } = matchPattern(pattern, parameter) as {
                tag: string;
            };

            if (!qualifier.includes('!')) {
                return {
                    $or: [
                        { tags: tag },
                        { localTags: tag },
                    ],
                };
            } else {
                return {
                    $and: [
                        { tags: { $ne: tag } },
                        { localTags: { $ne: tag } },
                    ],
                };
            }
        },
    }),

    stats: createCommand({
        id:      '!stats',
        pattern: '{{power}}/{{toughness}}',

        query({ parameter }, { pattern }) {
            const { power, toughness } = matchPattern(pattern, parameter) as {
                power: string;
                toughness: string;
            };

            return {
                ...magic.halfNumber.query({
                    key:       'parts.power',
                    parameter: power,
                    operator:  '=',
                    qualifier: [],
                }),
                ...magic.halfNumber.query({
                    key:       'parts.toughness',
                    parameter: toughness,
                    operator:  '=',
                    qualifier: [],
                }),
            };
        },
    }),

    set:    builtin.simple({ id: 'set', alt: ['expansion', 's', 'e'] }),
    number: builtin.simple({ id: 'number', alt: 'num' }),
    lang:   builtin.simple({ id: 'lang', alt: ['l'] }),

    cost:           magic.cost({ id: 'cost', alt: ['mana', 'mana-cost', 'm'] }),
    manaValue:      builtin.number({ id: 'mana-value', alt: ['mv', 'cmc'], key: 'manaValue' }),
    color:          magic.color({ id: 'color', alt: ['c'], key: 'parts.color' }),
    colorIdentity:  magic.color({ id: 'color-identity', alt: ['cd'], key: 'colorIdentity' }),
    colorIndicator: magic.color({ id: 'color-indicator', alt: ['ci'], key: 'parts.colorIndicator' }),

    power:     magic.halfNumber({ id: 'power', alt: ['pow'], key: 'parts.power' }),
    toughness: magic.halfNumber({ id: 'toughness', alt: ['tou'], key: 'parts.toughness' }),

    loyalty: createCommand({
        id:         'loyalty',
        alt:        'loy',
        pattern:    '[{{loyalty}}]',
        operators:  allOperator,
        qualifiers: defaultQualifier,

        query: arg => magic.halfNumber.query({ key: 'parts.loyalty', ...arg }),
    }),

    name: createCommand({
        id:        'name',
        alt:       'n',
        modifiers: {
            oracle:  'o',
            unified: 'u',
            printed: 'p',
        },
        operators:  defaultOperator,
        qualifiers: defaultQualifier,
        allowRegex: true,

        query({
            modifier, parameter, operator, qualifier,
        }) {
            switch (modifier) {
            case 'oracle':
                return builtin.text.query({
                    key: 'parts.name.oracle', parameter, operator, qualifier,
                });
            case 'unified':
                return builtin.text.query({
                    key: 'parts.name.unified', parameter, operator, qualifier,
                });
            case 'printed':
                return builtin.text.query({
                    key: 'parts.name.printed', parameter, operator, qualifier,
                });
            default:
                return {
                    [!qualifier.includes('!') ? '$or' : '$and']: [
                        builtin.text.query({
                            key: 'parts.oracle.name', parameter, operator, qualifier,
                        }),
                        builtin.text.query({
                            key: 'parts.unified.name', parameter, operator, qualifier,
                        }),
                        builtin.text.query({
                            key: 'parts.printed.name', parameter, operator, qualifier,
                        }),
                    ],
                };
            }
        },
    }),

    type: createCommand({
        id:        'type',
        alt:       't',
        modifiers: {
            oracle:  'o',
            unified: 'u',
            printed: 'p',
        },
        operators:  defaultOperator,
        qualifiers: defaultQualifier,
        allowRegex: true,

        query({
            modifier, parameter, operator, qualifier,
        }) {
            switch (modifier) {
            case 'oracle':
                return builtin.text.query({
                    key: 'parts.oracle.typeline', parameter, operator, qualifier,
                });
            case 'unified':
                return builtin.text.query({
                    key: 'parts.unified.typeline', parameter, operator, qualifier,
                });
            case 'printed':
                return builtin.text.query({
                    key: 'parts.printed.typeline', parameter, operator, qualifier,
                });
            default:
                return {
                    [!qualifier.includes('!') ? '$or' : '$and']: [
                        builtin.text.query({
                            key: 'parts.oracle.typeline', parameter, operator, qualifier,
                        }),
                        builtin.text.query({
                            key: 'parts.unified.typeline', parameter, operator, qualifier,
                        }),
                        builtin.text.query({
                            key: 'parts.printed.typeline', parameter, operator, qualifier,
                        }),
                    ],
                };
            }
        },
    }),

    text: createCommand({
        id:        'text',
        alt:       'x',
        modifiers: {
            oracle:  'o',
            unified: 'u',
            printed: 'p',
        },
        operators:  defaultOperator,
        qualifiers: defaultQualifier,
        allowRegex: true,

        query({
            modifier, parameter, operator, qualifier,
        }) {
            switch (modifier) {
            case 'oracle':
                return builtin.text.query({
                    key: 'parts.oracle.text', parameter, operator, qualifier, multiline: true,
                });
            case 'unified':
                return builtin.text.query({
                    key: 'parts.unified.text', parameter, operator, qualifier, multiline: true,
                });
            case 'printed':
                return builtin.text.query({
                    key: 'parts.printed.text', parameter, operator, qualifier, multiline: true,
                });
            default:
                return {
                    [!qualifier.includes('!') ? '$or' : '$and']: [
                        builtin.text.query({
                            key: 'parts.oracle.text', parameter, operator, qualifier, multiline: true,
                        }),
                        builtin.text.query({
                            key: 'parts.unified.text', parameter, operator, qualifier, multiline: true,
                        }),
                        builtin.text.query({
                            key: 'parts.printed.text', parameter, operator, qualifier, multiline: true,
                        }),
                    ],
                };
            }
        },
    }),

    oracle: createCommand({
        id:         '!text-oracle',
        alt:        'o',
        operators:  defaultOperator,
        qualifiers: defaultQualifier,
        allowRegex: true,

        query: ({ parameter, operator, qualifier }) => ({
            [!qualifier.includes('!') ? '$or' : '$and']: [
                builtin.text.query({
                    key: 'parts.oracle.text', parameter, operator, qualifier,
                }),
                builtin.text.query({
                    key: 'parts.unified.text', parameter, operator, qualifier,
                }),
            ],
        }),
    }),

    flavorText: builtin.text({ id: 'flavor-text', alt: ['flavor', 'ft'], key: 'parts.flavorText' }),
    flavorName: builtin.text({ id: 'flavor-name', alt: 'fn', key: 'parts.flavorName' }),
    layout:     builtin.simple({ id: 'layout' }),

    rarity: createCommand({
        id:         'rarity',
        alt:        ['r'],
        operators:  defaultOperator,
        qualifiers: defaultQualifier,
        query:      ({ parameter, operator, qualifier }) => {
            const rarity = (
                {
                    c: 'common',
                    u: 'uncommon',
                    r: 'rare',
                    m: 'mythic',
                    s: 'special',
                } as Record<string, string>
            )[parameter] ?? parameter;

            return builtin.simple.query({
                key: 'rarity', parameter: rarity, operator, qualifier,
            });
        },
    }),

    format: createCommand({
        id:         'format',
        alt:        ['f'],
        operators:  [':'] as const,
        qualifiers: defaultQualifier,

        query: ({ parameter, qualifier }) => {
            if (parameter.includes(',')) {
                const [format, status] = parameter.split(',');

                if (!qualifier.includes('!')) {
                    return { [`legalities.${format}`]: status };
                } else {
                    return { [`legalities.${format}`]: { $ne: status } };
                }
            } else {
                if (!qualifier.includes('!')) {
                    return {
                        [`legalities.${parameter}`]: { $in: ['legal', 'restricted'] },
                    };
                } else {
                    return {
                        [`legalities.${parameter}`]: { $nin: ['legal', 'restricted'] },
                    };
                }
            }
        },
    }),

    counter: createCommand({
        id:         'counter',
        operators:  [':'],
        qualifiers: defaultQualifier,

        query: ({ parameter, qualifier }) => {
            parameter = toIdentifier(parameter);

            if (!qualifier.includes('!')) {
                return { counters: parameter };
            } else {
                return { counters: { $ne: parameter } };
            }
        },
    }),

    keyword: createCommand({
        id:        'keyword',
        operators: [':'],

        query: ({ parameter, qualifier }) => {
            parameter = toIdentifier(parameter);

            if (!qualifier.includes('!')) {
                return { keywords: parameter };
            } else {
                return { keywords: { $ne: parameter } };
            }
        },
    }),

    orderBy: createCommand({
        id:        'order',
        operators: [':'],

        query() {},

        post: ({ parameter }) => {
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
                    agg.sort({ 'part.unified.name': dir });
                    break;
                case 'date':
                    agg.sort({ releaseDate: dir });
                    break;
                case 'id':
                    agg.sort({ cardId: dir });
                    break;
                case 'cmc':
                case 'mv':
                case 'cost':
                    agg.sort({ manaValue: dir });
                    break;
                default:
                    throw new QueryError({ type: 'invalid-query' });
                }
            };
        },
    }),
};
