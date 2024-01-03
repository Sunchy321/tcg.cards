import {
    Command, defineCommand, DefaultQualifier, defaultQualifier, AllOperator, allOperator,
} from '../../../src/command';

export type ColorCommand = Command<never, AllOperator, DefaultQualifier, false, never>;

export type ColorOption = {
    id: string;
    alt?: string[] | string;
};

export default function color(options: ColorOption): ColorCommand {
    const { id, alt } = options;

    return defineCommand({
        id,
        alt,
        operators:  allOperator,
        qualifiers: defaultQualifier,

    });
}
