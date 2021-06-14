/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import { QueryError } from '@/search';

const colorEnums = 'WUBRGOP'.split('');

export default function colorQuery(
    key: string,
    param: string | RegExp,
    op: string | undefined,
) {
    if (param instanceof RegExp) {
        throw new QueryError({
            type:  'regex/disabled',
            value: op || '',
        });
    }

    const text = param.toLowerCase();

    if (text === 'c' || text === 'colorless') {
        switch (op) {
        case ':':
            return { [key]: '' };
        case '!:':
            return { [key]: { $ne: '' } };
        default:
            throw new QueryError({
                type:  'operator/unsupported',
                value: op || '',
            });
        }
    } else if (text === 'm' || text === 'multicolor') {
        switch (op) {
        case ':':
            return { [key]: /../ };
        case '!:':
            return { [key]: { $not: /../ } };
        default:
            throw new QueryError({
                type:  'operator/unsupported',
                value: op || '',
            });
        }
    }

    // count of color
    if (/^\d+$/.test(text)) {
        const count = Number.parseInt(text);

        switch (op) {
        case '=':
            return { [key]: new RegExp(`^.{${count}}$`) };
        case '!=':
            return { [key]: { $not: new RegExp(`^.{${count}}$`) } };
        case '>':
            return { [key]: new RegExp(`^.{${count + 1},}$`) };
        case '>=':
            return { [key]: new RegExp(`^.{${count},}$`) };
        case '<':
            return { [key]: new RegExp(`^.{0,${count - 1}}$`) };
        case '<=':
            return { [key]: new RegExp(`^.{0,${count}}$`) };
        default:
            throw new QueryError({
                type:  'operator/unsupported',
                value: op || '',
            });
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
        }

        const chars = text.toUpperCase().split('');

        if (chars.some(c => !colorEnums.includes(c))) {
            throw new QueryError({
                type:  'color/unsupported',
                value: op || '',
            });
        }

        return colorEnums.filter(c => chars.includes(c));
    })();

    switch (op) {
    case ':':
    case '>=':
        return {
            [key]: new RegExp(`^${colorEnums.map(c => (colors.includes(c) ? c : c + '?')).join('')}$`),
        };
    case '!:':
        return {
            [key]: {
                $not: new RegExp(`^${colorEnums.map(c => (colors.includes(c) ? c : c + '?')).join('')}$`),
            },
        };
    case '=':
        return {
            [key]: new RegExp(`^${colorEnums.map(c => colors.includes(c) ? c : '').join('')}$`),
        };
    case '!=':
        return {
            [key]: {
                $not: new RegExp(`^${colorEnums.map(c => colors.includes(c) ? c : '').join('')}$`),
            },
        };
    case '>':
        return {
            [key]: new RegExp(
                `^(?=.{${colors.length + 1}})${colorEnums.map(c => (colors.includes(c) ? c : c + '?')).join('')}$`,
            ),
        };
    case '<':
        return {
            [key]: new RegExp(
                `^(?!.{${colors.length}})${colorEnums.map(c => (colors.includes(c) ? c + '?' : '')).join('')}$`,
            ),
        };
    case '<=':
        return {
            [key]: new RegExp(
                `^${colorEnums.map(c => colors.includes(c) ? c + '?' : '').join('')}$`,

            ),
        };
    default:
        throw new QueryError({
            type:  'operator/unsupported',
            value: op || '',
        });
    }
}
