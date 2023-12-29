import {
    Command, defineCommand, DefaultQualifier, defaultQualifier, numericOperator, NumericOperator,
} from '../..';

export type NumberCommand = Command<never, NumericOperator, DefaultQualifier, false, never>;

export type NumberOption = {
    id: string;
    alt?: string[] | string;
};

export default function number(options: NumberOption): NumberCommand {
    const {
        id, alt,
    } = options;

    return defineCommand({
        id,
        alt,
        operators:  numericOperator,
        qualifiers: defaultQualifier,
    });
}
