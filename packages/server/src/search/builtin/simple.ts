import { Command, command } from '@/search/command';

function query(
    key: string,
    param: string,
    op: ':' | '=',
    qual: '!'[],
): any {
    switch (op) {
    case ':':
        if (!qual.includes('!')) {
            return { [key]: { $in: param.split(',') } };
        } else {
            return { [key]: { $nin: param.split(',') } };
        }
    case '=':
        if (!qual.includes('!')) {
            return { [key]: param };
        } else {
            return { [key]: { $ne: param } };
        }
    default:
        return {};
    }
}

export default function simple(config: {
    id: string;
    alt?: string[];
    key?: string;
}): Command<never, false, ':' | '=', '!'> {
    const { id, alt, key } = config;

    return command({
        id,
        alt,
        allowRegex: false,
        op:         [':', '='],

        query: ({ param, op, qual }) => query(key ?? id, param, op, qual),
    });
}

simple.query = query;
