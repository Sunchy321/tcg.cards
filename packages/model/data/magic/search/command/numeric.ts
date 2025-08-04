import {
    Command, defineCommand, DefaultQualifier, defaultQualifier, AllOperator, allOperator,
} from '@search/command';

export type NumericCommand = Command<never, AllOperator, DefaultQualifier, false, never, never>;

export type NumericOption = {
    id:   string;
    alt?: string[] | string;
};

export default function numeric(options: NumericOption): NumericCommand {
    const { id, alt } = options;

    return defineCommand({
        id,
        alt,
        operators:  allOperator,
        qualifiers: defaultQualifier,
    });
}
