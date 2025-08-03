import {
    Command, CommonCommand, Operator, Qualifier, Argument, CommonArgument,
} from './index';

export type I18N = (key: string, named?: Record<string, any>) => string;

export type ExplainFunc<
    M extends string,
    O extends Operator,
    Q extends Qualifier,
    AR extends boolean,
    P,
    X,
> = (arg: Argument<M, O, Q, AR, P, X>, i18n: I18N) => string | undefined;

export type ExplainFuncOf<C> = C extends Command<infer M, infer O, infer Q, infer AR, infer P, infer X>
    ? ExplainFunc<string extends M ? never : M, O, Q, AR, P, X>
    : never;

export type ClientCommand<
    M extends string,
    O extends Operator,
    Q extends Qualifier,
    AR extends boolean,
    P,
    X,
> = Command<M, O, Q, AR, P, X> & {
    explain: ExplainFuncOf<Command<M, O, Q, AR, P, X>>;
};

export type CommonClientCommand = CommonCommand & {
    explain: (arg: CommonArgument, i18n: I18N) => string | undefined;
};

export type ClientCommandOf<C> = C extends Command<infer M, infer O, infer Q, infer AR, infer P, infer X>
    ? ClientCommand<M, O, Q, AR, P, X>
    : never;

export type ClientCommandOption<
    M extends string,
    O extends Operator,
    Q extends Qualifier,
    AR extends boolean,
    P,
    X,
> = Command<M, O, Q, AR, P, X> | {
    command:  Command<M, O, Q, AR, P, X>;
    explain?: ExplainFuncOf<Command<M, O, Q, AR, P, X>>;
};

export function defineClientCommand<
    M extends string,
    O extends Operator,
    Q extends Qualifier,
    AR extends boolean,
    P,
    X,
>(options: ClientCommandOption<M, O, Q, AR, P, X>): ClientCommand<M, O, Q, AR, P, X> {
    const { command, explain = () => undefined } = (() => {
        if ('command' in options) {
            return options;
        }

        return {
            command: options,
            explain: undefined,
        };
    })();

    return { ...command, explain };
}
