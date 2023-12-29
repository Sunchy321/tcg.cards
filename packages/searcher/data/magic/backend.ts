import { BackendModel, defineBackendModel } from '../../src/model/backend';
import { defineBackendCommand } from '../../src/command/backend';
import { commands } from './index';

import * as builtin from '../../src/command/builtin/backend';
import * as magic from './command/backend';
import { QueryError } from 'command/error';

import { deburr } from 'lodash';

function toIdentifier(text: string): string {
    return deburr(text)
        .trim()
        .toLowerCase()
        .replace(' // ', '____')
        .replace('/', '____')
        .replace(/[^a-z0-9]/g, '_');
}

const raw = defineBackendCommand({
    command: commands.raw,
    query:   ({ parameter }) => {
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
});

const stats = defineBackendCommand({
    command: commands.stats,

    query({ pattern, operator, qualifier }) {
        if (pattern == null) {
            throw new QueryError({ type: 'invalid-query' });
        }

        const { power, toughness } = pattern;

        if (qualifier?.includes('!')) {
            return {
                $or: [
                    magic.halfNumber.query({
                        key:       'parts.power',
                        parameter: power,
                        operator:  operator ?? '=',
                        qualifier,
                    }),
                    magic.halfNumber.query({
                        key:       'parts.toughness',
                        parameter: toughness,
                        operator:  operator ?? '=',
                        qualifier,
                    }),
                ],
            };
        } else {
            return {
                ...magic.halfNumber.query({
                    key:       'parts.power',
                    parameter: power,
                    operator:  operator ?? '=',
                    qualifier: qualifier ?? [],
                }),
                ...magic.halfNumber.query({
                    key:       'parts.toughness',
                    parameter: toughness,
                    operator:  operator ?? '=',
                    qualifier: qualifier ?? [],
                }),
            };
        }
    },
});

const hash = defineBackendCommand({
    command: commands.hash,
    query({ pattern, qualifier }) {
        if (pattern == null) {
            throw new QueryError({ type: 'invalid-query' });
        }

        const { tag } = pattern;

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
});

const set = builtin.simple(commands.set);
const num = builtin.simple(commands.num);
const lang = builtin.simple(commands.lang);

const cost = magic.cost(commands.cost);
const manaValue = builtin.number(commands.manaValue, { key: 'manaValue' });

const color = magic.color(commands.color, { key: 'parts.color' });
const colorIdentity = magic.color(commands.colorIdentity, { key: 'colorIdentity' });
const colorIndicator = magic.color(commands.colorIndicator, { key: 'parts.colorIndicator' });

const power = magic.halfNumber(commands.power, { key: 'parts.power' });
const toughness = magic.halfNumber(commands.toughness, { key: 'parts.toughness' });

const loyalty = defineBackendCommand({
    command: commands.loyalty,
    query({
        pattern, parameter, operator, qualifier,
    }) {
        return magic.halfNumber.query({
            key:       'parts.loyalty',
            parameter: pattern?.loyalty ?? parameter,
            operator,
            qualifier: qualifier ?? [],
        });
    },
});

const defense = defineBackendCommand({
    command: commands.defense,
    query({
        pattern, parameter, operator, qualifier,
    }) {
        return magic.halfNumber.query({
            key:       'parts.defense',
            parameter: pattern?.defense ?? parameter,
            operator,
            qualifier,
        });
    },
});

const name = defineBackendCommand({
    command: commands.name,
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
});

const type = defineBackendCommand({
    command: commands.type,
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
});

const text = defineBackendCommand({
    command: commands.text,
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
});

const oracle = defineBackendCommand({
    command: commands.oracle,
    query:   ({ parameter, operator, qualifier }) => ({
        [!qualifier.includes('!') ? '$or' : '$and']: [
            builtin.text.query({
                key: 'parts.oracle.text', parameter, operator, qualifier,
            }),
            builtin.text.query({
                key: 'parts.unified.text', parameter, operator, qualifier,
            }),
        ],
    }),
});

const flavorText = builtin.text(commands.flavorText, { key: 'parts.flavorText' });
const flavorName = builtin.text(commands.flavorName, { key: 'parts.flavorName' });
const layout = builtin.simple(commands.layout);

const rarity = defineBackendCommand({
    command: commands.rarity,
    query:   ({ parameter, operator, qualifier }) => {
        // eslint-disable-next-line @typescript-eslint/no-shadow
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
});

const format = defineBackendCommand({
    command: commands.format,
    query:   ({ parameter, qualifier }) => {
        if (parameter.includes(',')) {
            // eslint-disable-next-line @typescript-eslint/no-shadow
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
});

const counter = defineBackendCommand({
    command: commands.counter,
    query:   ({ parameter, qualifier }) => {
        parameter = toIdentifier(parameter);

        if (!qualifier.includes('!')) {
            return { counters: parameter };
        } else {
            return { counters: { $ne: parameter } };
        }
    },
});

const keyword = defineBackendCommand({
    command: commands.keyword,
    query:   ({ parameter, qualifier }) => {
        parameter = toIdentifier(parameter);

        if (!qualifier.includes('!')) {
            return { keywords: parameter };
        } else {
            return { keywords: { $ne: parameter } };
        }
    },
});

const orderBy = defineBackendCommand({
    command: commands.orderBy,
    query() {},

    post: ({ parameter }) => {
        parameter = parameter.toLowerCase();

        // eslint-disable-next-line @typescript-eslint/no-shadow
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
                agg.sort({ 'parts.unified.name': dir });
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
});

const backedCommands = {
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
    orderBy,
};

export default defineBackendModel({
    commands: Object.values(backedCommands) as BackendModel['commands'],
});
