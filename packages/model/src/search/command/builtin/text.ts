import {
    Command, defineCommand, DefaultOperator, defaultOperator, DefaultQualifier, defaultQualifier,
} from '../index';

export type TextCommand = Command<never, DefaultOperator, DefaultQualifier, true, never, never>;

export type TextOption = {
    id:   string;
    alt?: string[] | string;
};

export default function text(options: TextOption): TextCommand {
    const {
        id, alt,
    } = options;

    return defineCommand({
        id,
        alt,
        operators:  defaultOperator,
        qualifiers: defaultQualifier,
        allowRegex: true,
    });
}
