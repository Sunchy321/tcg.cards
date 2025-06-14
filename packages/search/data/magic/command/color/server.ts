import { ServerCommandOf, DBQuery, QueryOption } from '@search/command/server';
import { QueryError } from '@search/command/error';

import { ColorCommand } from '@search-data/magic/command/color';

const colorEnums = 'WUBRGOP'.split('');

export type ColorServerCommand = ServerCommandOf<ColorCommand>;

export type ColorServerOption = {
    key?: string;
};

export type ColorQueryOption = QueryOption<ColorCommand, ColorServerOption>;

function query(options: ColorQueryOption): DBQuery {
    const {
        parameter, operator, qualifier, key,
    } = options;

    const text = parameter.toLowerCase();

    if (text === 'c' || text === 'colorless') {
        switch (operator) {
        case ':':
        case '=':
            if (!qualifier.includes('!')) {
                return { [key]: '' };
            } else {
                return { [key]: { $ne: '' } };
            }
        default:
            throw new QueryError({ type: 'invalid-query' });
        }
    } else if (text === 'm' || text === 'multicolor') {
        switch (operator) {
        case ':':
            if (!qualifier.includes('!')) {
                return { [key]: /../ };
            } else {
                return { [key]: { $not: /../ } };
            }
        default:
            throw new QueryError({ type: 'invalid-query' });
        }
    }

    // count of color
    if (/^\d+$/.test(text)) {
        const count = Number.parseInt(text, 10);

        switch (operator) {
        case '=':
            if (!qualifier.includes('!')) {
                return { [key]: new RegExp(`^.{${count}}$`) };
            } else {
                return { [key]: { $not: new RegExp(`^.{${count}}$`) } };
            }
        case '>':
            return { [key]: new RegExp(`^.{${count + 1},}$`) };
        case '>=':
            return { [key]: new RegExp(`^.{${count},}$`) };
        case '<':
            return { [key]: new RegExp(`^.{0,${count - 1}}$`) };
        case '<=':
            return { [key]: new RegExp(`^.{0,${count}}$`) };
        default:
            throw new QueryError({ type: 'invalid-query' });
        }
    }

    const colors = (() => {
        switch (text) {
        case 'white':
            return ['W'];
        case 'blue':
            return ['U'];
        case 'black':
            return ['B'];
        case 'red':
            return ['R'];
        case 'green':
            return ['G'];
        case 'gold':
            return ['O'];
        case 'pink':
            return ['P'];
        case 'azorius':
            return ['W', 'U'];
        case 'dimir':
            return ['U', 'B'];
        case 'rakdos':
            return ['B', 'R'];
        case 'gruul':
            return ['R', 'G'];
        case 'selesyna':
            return ['W', 'G'];
        case 'orzhov':
            return ['W', 'B'];
        case 'izzet':
            return ['U', 'R'];
        case 'golgari':
            return ['B', 'G'];
        case 'boros':
            return ['W', 'R'];
        case 'simic':
            return ['U', 'G'];
        case 'bant':
            return ['W', 'U', 'G'];
        case 'esper':
            return ['W', 'U', 'B'];
        case 'grixis':
            return ['U', 'B', 'R'];
        case 'jund':
            return ['B', 'R', 'G'];
        case 'naya':
            return ['W', 'R', 'G'];
        case 'mardu':
            return ['W', 'B', 'R'];
        case 'temur':
            return ['U', 'R', 'G'];
        case 'abzan':
            return ['W', 'B', 'G'];
        case 'jeskai':
            return ['W', 'U', 'R'];
        case 'sultai':
            return ['U', 'B', 'G'];
        case 'chaos':
            return ['U', 'B', 'R', 'G'];
        case 'aggression':
            return ['W', 'B', 'R', 'G'];
        case 'altruism':
            return ['W', 'U', 'R', 'G'];
        case 'growth':
            return ['W', 'U', 'B', 'G'];
        case 'artifice':
            return ['W', 'U', 'B', 'R'];
        default:
        }

        const chars = text.toUpperCase().split('');

        if (chars.some(c => !colorEnums.includes(c))) {
            throw new QueryError({ type: 'invalid-query' });
        }

        return colorEnums.filter(c => chars.includes(c));
    })();

    switch (operator) {
    case ':':
        if (qualifier.includes('!')) {
            return {
                [key]: {
                    $not: new RegExp(`^${colorEnums.map(c => (colors.includes(c) ? c : `${c}?`)).join('')}$`),
                },
            };
        }
        // fallthrough
    case '>=':
        return {
            [key]: new RegExp(`^${colorEnums.map(c => (colors.includes(c) ? c : `${c}?`)).join('')}$`),
        };

    case '=':
        if (!qualifier.includes('!')) {
            return {
                [key]: new RegExp(`^${colorEnums.map(c => (colors.includes(c) ? c : '')).join('')}$`),
            };
        } else {
            return {
                [key]: {
                    $not: new RegExp(`^${colorEnums.map(c => (colors.includes(c) ? c : '')).join('')}$`),
                },
            };
        }
    case '>':
        return {
            [key]: new RegExp(
                `^(?=.{${colors.length + 1}})${colorEnums.map(c => (colors.includes(c) ? c : `${c}?`)).join('')}$`,
            ),
        };
    case '<':
        return {
            [key]: new RegExp(
                `^(?!.{${colors.length}})${colorEnums.map(c => (colors.includes(c) ? `${c}?` : '')).join('')}$`,
            ),
        };
    case '<=':
        return {
            [key]: new RegExp(
                `^${colorEnums.map(c => (colors.includes(c) ? `${c}?` : '')).join('')}$`,

            ),
        };
    default:
        throw new QueryError({ type: 'invalid-query' });
    }
}

export default function color(command: ColorCommand, options?: ColorServerOption): ColorServerCommand {
    const { key = command.id } = options ?? { };

    return {
        ...command,
        query: args => query({ key, ...args }),
    };
}

color.query = query;
