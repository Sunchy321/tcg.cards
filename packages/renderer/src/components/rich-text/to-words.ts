import { canWrapBetween } from './can-wrap-between';

export type ToWordOption = {
    lang: string;
};

export function toWords(text: string, option: ToWordOption): string[] {
    const { length } = text;
    const words = [];

    let inTag = false;
    let manualLineBreak = false;
    let word = '';

    let i = 0;

    while (i < length) {
        const c = text[i];

        if (c === '[' && text[i + 2] === ']') {
            const n = text[i + 1];

            if (n === 'b' || n === 'd') {
                words.push(text.slice(i, i + 3));
                i += 2;
            } else if (n === 'x') {
                manualLineBreak = true;
                words.push(text.slice(i, i + 3));
                i += 2;
            }
        } else if (c === '<') {
            inTag = true;
            word += c;
        } else if (c === '>') {
            inTag = false;
            word += c;
        } else if (inTag) {
            word += c;
        } else {
            const prev = text[i - 1] ?? '\0';
            const curr = text[i] ?? '\0';
            const next = text[i + 1] ?? '\0';

            if (!manualLineBreak && canWrapBetween(option.lang, prev, curr, next)) {
                words.push(word);
                word = c;
            } else {
                word += c;
            }
        }

        i += 1;
    }

    words.push(word);

    return words;
}
