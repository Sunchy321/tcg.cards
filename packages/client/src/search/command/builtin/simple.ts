import { ClientCommandOf, I18N } from '../index';
import { ArgumentOf } from '@search/command';

import { SimpleCommand } from '@search/command/builtin/simple';

import { OperatorMapOf, defaultTranslate } from 'src/search/translate';

export type SimpleClientCommand = ClientCommandOf<SimpleCommand>;

export type SimpleClientOption = {
    map?: Record<string, string> | boolean | ((parameter: string) => string);
};

const operatorMap: OperatorMapOf<SimpleCommand> = {
    '=':  'is',
    '!=': 'is-not',
    ':':  'is',
    '!:': 'is-not',
};

function explain(arg: ArgumentOf<SimpleCommand>, i18n: I18N, id: string, options: SimpleClientOption): string {
    const { map } = options;

    const realParam = (() => {
        const { parameter } = arg;

        // NO changes
        if (map == null || map === false) {
            return parameter;
        }

        const paramKey = map === true
            ? parameter
            : map instanceof Function
                ? map(parameter)
                : map[parameter] ?? parameter;

        return i18n(`$.parameter.${id}.${paramKey}`);
    })();

    return defaultTranslate({ ...arg, parameter: realParam }, i18n, id, operatorMap);
}

export default function simple(command: SimpleCommand, options?: SimpleClientOption): SimpleClientCommand {
    return {
        ...command,
        explain: (args, i18n) => explain(args, i18n, command.id, options ?? { }),
    };
}

simple.explain = explain;
