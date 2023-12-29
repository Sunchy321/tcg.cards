import {
    Command, defineCommand, DefaultQualifier, defaultQualifier, AllOperator, allOperator,
} from '../../../../src/command';

export type CostCommand = Command<never, AllOperator, DefaultQualifier, false, never>;

export type CostOption = {
    id: string;
    alt?: string[] | string;
    key?: string;
    allowFloat?: boolean;
};

export default function cost(options: CostOption): CostCommand {
    const { id, alt } = options;

    return defineCommand({
        id,
        alt,
        operators:  allOperator,
        qualifiers: defaultQualifier,
    });
}
