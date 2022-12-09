import {
    Command, createCommand, DBQuery, DefaultQualifier, defaultQualifier, numericOperator, NumericOperator,
} from '../../command';
import { QueryError } from '../../command/error';

export type NumberCommand = Command<never, NumericOperator, DefaultQualifier, false>;

export type NumberOption = {
    id: string;
    alt?: string[] | string;
    key?: string;
    allowFloat?: boolean;
};

export type NumberQueryOption = Parameters<NumberCommand['query']>[0] & { key: string, allowFloat?: boolean };

function query(options: NumberQueryOption): DBQuery {
    const {
        key, allowFloat = false, parameter, operator, qualifier,
    } = options;

    const num = allowFloat ? Number.parseFloat(parameter) : Number.parseInt(parameter, 10);

    if (Number.isNaN(num)) {
        throw new QueryError({ type: 'invalid-query' });
    }

    switch (operator) {
    case '=':
        if (!qualifier.includes('!')) {
            return { [key]: { $eq: num } };
        } else {
            return { [key]: { $ne: num } };
        }
    case '>':
        return { [key]: { $gt: num } };
    case '>=':
        return { [key]: { $gte: num } };
    case '<':
        return { [key]: { $lt: num } };
    case '<=':
        return { [key]: { $lte: num } };
    default:
        throw new QueryError({ type: 'invalid-query' });
    }
}

export default function number(options: NumberOption): NumberCommand {
    const {
        id, alt, key = id, allowFloat = false,
    } = options;

    return createCommand({
        id,
        alt,
        operators:  numericOperator,
        qualifiers: defaultQualifier,

        query: arg => query({ key, allowFloat, ...arg }),
    });
}

number.query = query;
