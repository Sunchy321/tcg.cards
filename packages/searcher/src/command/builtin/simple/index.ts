import {
    Command, defineCommand, DefaultOperator, defaultOperator, DefaultQualifier, defaultQualifier,
} from '../../index';

export type SimpleCommand = Command<never, DefaultOperator, DefaultQualifier, false, never>;

export type SimpleOption = {
    id: string;
    alt?: string[] | string;
};

export default function simple(options: SimpleOption): SimpleCommand {
    const { id, alt } = options;

    return defineCommand({
        id,
        alt,
        allowRegex: false,
        operators:  defaultOperator,
        qualifiers: defaultQualifier,
    });
}
