import {
    Command, defineCommand, DefaultQualifier, defaultQualifier, numericOperator, NumericOperator,
} from '../..';

type NumberMeta = {
    allowFloat: boolean;
};

export type NumberCommand = Command<never, NumericOperator, DefaultQualifier, false, never, NumberMeta>;

export type NumberOption = {
    id: string;
    alt?: string[] | string;
    allowFloat?: boolean;
};

export default function number(options: NumberOption): NumberCommand {
    const {
        id, alt, allowFloat = false,
    } = options;

    return defineCommand({
        id,
        alt,
        operators:  numericOperator,
        qualifiers: defaultQualifier,
        meta:       { allowFloat },
    });
}
