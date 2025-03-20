import { toWords } from './to-words';
import { removeTag } from './remove-tag';

import { getLineCount, getSize } from '../../util';

import { UnderwearOption, isUnderwearNeeded, getFinalContainerWidth } from './underwear';

export type WrapStringOption = {
    lang:      string;
    font:      string;
    size:      number;
    shape:     [{ x: number, y: number }, { x: number, y: number }];
    underwear: Omit<UnderwearOption, 'font' | 'size'>;
};

function removeLineBreakTagsHardSpace(text: string): string {
    let result = '';
    let flag = false;
    for (let i = 0; i < text.length; i += 1) {
        if (text[i] === '[' && i + 1 < text.length && 'bdx'.includes(text[i + 1]) && text[i + 2] === ']') {
            flag = true;
        } else {
            if (text[i] === ']') {
                if (i - 2 >= 0 && 'dbx'.includes(text[i - 1]) && text[i - 2] === '[') {
                    flag = false;
                    continue;
                }
                flag = false;
            }

            if (!flag) {
                if (text[i] === '_') {
                    result += ' ';
                } else {
                    result += text[i];
                }
            }
        }
    }

    return result;
}

export function wrapString(text: string, option: WrapStringOption): string {
    if (text === '') {
        return '';
    }

    const width = option.shape[1].x - option.shape[0].x;
    const height = option.shape[1].y - option.shape[0].y;

    const lineCount = getLineCount(text);

    const words = toWords(text, { lang: option.lang });

    const needUnderwear = option.underwear != null
        ? isUnderwearNeeded(words, width, {
            flip:   option.underwear.flip,
            font:   option.font,
            size:   option.size,
            width:  option.underwear.width,
            height: option.underwear.height,
        })
        : false;

    let fullText = '';
    let currLine = '';

    for (const word of words) {
        const value = removeTag(word);

        currLine += value;

        const lineWidth = getSize(currLine, option.font, option.size).width;

        const maxWidth = needUnderwear
            ? getFinalContainerWidth(removeTag(fullText), width, height, {
                flip:   option.underwear!.flip,
                font:   option.font,
                size:   option.size,
                width:  option.underwear!.width,
                height: option.underwear!.height,
            })
            : width;

        if (lineWidth < maxWidth) {
            if (word.includes('\n')) {
                currLine = '';

                for (let j = 0; j < lineCount - 1; j += 1) {
                    currLine += '\n';
                }

                currLine += value;
            }
            fullText += word;
        } else {
            if (fullText.length > 2 && fullText.endsWith('[d]')) {
                fullText += '-';
            }

            if (fullText.length > 0) {
                fullText += '\n';
            }

            fullText += word.trimStart();

            currLine = '';

            for (let k = 0; k < lineCount; k += 1) {
                currLine += '\n';
            }

            currLine += value;
        }
    }

    return removeLineBreakTagsHardSpace(fullText)
        .replace(/<_/g, '< ')
        .replace(/>_/g, '> ');
}
