import {
    Command, defineCommand, DefaultQualifier, defaultQualifier, AllOperator, allOperator,
} from '../../../src/command';

export type HalfNumberCommand = Command<never, AllOperator, DefaultQualifier, false, never>;

export type HalfNumberOption = {
    id: string;
    alt?: string[] | string;
};

export default function halfNumber(options: HalfNumberOption): HalfNumberCommand {
    const { id, alt } = options;

    return defineCommand({
        id,
        alt,
        operators:  allOperator,
        qualifiers: defaultQualifier,
    });
}
