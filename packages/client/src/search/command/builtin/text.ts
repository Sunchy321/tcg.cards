import { ClientCommandOf, I18N } from '../index';
import { ArgumentOf } from '@search/command';

import { TextCommand } from '@search/command/builtin/text';

import { OperatorMapOf, defaultTranslate } from 'src/search/translate';

export type TextClientCommand = ClientCommandOf<TextCommand>;

export type TextQueryOption = ArgumentOf<TextCommand>;

export const textMap: OperatorMapOf<TextCommand> = {
    '=':  'equal',
    '!=': 'not-equal',
    ':':  'include',
    '!:': 'not-include',
};

const regexMap: OperatorMapOf<TextCommand> = {
    '=':  'fully-match',
    '!=': 'not-full-match',
    ':':  'match',
    '!:': 'not-match',
};

function explain(arg: ArgumentOf<TextCommand>, i18n: I18N, id: string): string {
    return defaultTranslate(arg, i18n, id, (op, { parameter }) => {
        if (parameter instanceof RegExp) {
            return regexMap[op as keyof OperatorMapOf<TextCommand>] ?? op;
        } else {
            return textMap[op as keyof OperatorMapOf<TextCommand>] ?? op;
        }
    });
}

export default function text(command: TextCommand): TextClientCommand {
    return { ...command, explain: (arg, i18n) => explain(arg, i18n, command.id) };
}

text.explain = explain;
