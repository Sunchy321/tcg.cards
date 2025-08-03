import {
    Command, defineCommand, DefaultOperator, defaultOperator, DefaultQualifier, defaultQualifier,
} from '../index';

import _ from 'lodash';

export type SimpleSetMeta = {
    valueMap:        Record<string, string[]>;
    countDuplicates: boolean;
};

export type SimpleSetCommand = Command<never, DefaultOperator, DefaultQualifier, false, never, SimpleSetMeta>;

export type SimpleSetOption = {
    id:               string;
    alt?:             string[] | string;
    valueMap?:        Record<string, string[] | string>;
    countDuplicates?: boolean;
};

export default function simpleSet(options: SimpleSetOption): SimpleSetCommand {
    const {
        id,
        alt,
        valueMap = {},
        countDuplicates = false,
    } = options;

    return defineCommand({
        id,
        alt,
        allowRegex: false,
        operators:  defaultOperator,
        qualifiers: defaultQualifier,
        meta:       { valueMap: _.mapValues(valueMap, _.castArray), countDuplicates },
    });
}
