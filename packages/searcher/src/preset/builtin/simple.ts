import {
    Command, createCommand, DBQuery, DefaultOperator, defaultOperator, DefaultQualifier, defaultQualifier,
} from '../../command';

export type SimpleCommand = Command<never, DefaultOperator, DefaultQualifier, false>;

export type SimpleOption = {
    id: string;
    alt?: string[] | string;
    key?: string;
};

export type SimpleQueryOption = Parameters<SimpleCommand['query']>[0] & { key: string };

function query(options: SimpleQueryOption): DBQuery {
    const {
        key, parameter, operator, qualifier,
    } = options;

    switch (operator) {
    case ':':
        if (!qualifier.includes('!')) {
            return { [key]: { $in: parameter.split(',') } };
        } else {
            return { [key]: { $nin: parameter.split(',') } };
        }
    case '=':
        if (!qualifier.includes('!')) {
            return { [key]: parameter };
        } else {
            return { [key]: { $ne: parameter } };
        }
    default:
        return {};
    }
}

export default function simple(options: SimpleOption): SimpleCommand {
    const { id, alt, key = id } = options;

    return createCommand({
        id,
        alt,
        allowRegex: false,
        operators:  defaultOperator,
        qualifiers: defaultQualifier,

        query: arg => query({ key, ...arg }),
    });
}

simple.query = query;
