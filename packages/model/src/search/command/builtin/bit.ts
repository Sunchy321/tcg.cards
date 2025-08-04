import {
    AllOperator, Command, defineCommand, DefaultQualifier, defaultQualifier, numericOperator,
} from '../index';

import _ from 'lodash';

type BitMeta = {
    values: string;
    words?: Record<string, string[]>;
};

export type BitCommand = Command<never, AllOperator, DefaultQualifier, false, never, BitMeta>;

export type BitOption = {
    id:     string;
    alt?:   string[] | string;
    values: string;
    words?: Record<string, string[]>;
};

export default function number(options: BitOption): BitCommand {
    const { id, alt, values, words } = options;

    return defineCommand({
        id,
        alt,
        operators:  numericOperator,
        qualifiers: defaultQualifier,
        meta:       {
            values: values.toUpperCase(),
            words:  words != null ? _.mapValues(words, v => v.map(c => c.toUpperCase())) : undefined,
        },
    });
}
