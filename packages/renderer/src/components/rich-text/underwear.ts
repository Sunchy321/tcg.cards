import { getSize } from '../../util';

import { removeTag } from './remove-tag';

export type UnderwearOption = {
    font: string;
    size: number;
    flip: boolean;
    width: number;
    height: number;
};

export function isUnderwearNeeded(
    words: string[],
    width: number,
    option: UnderwearOption,
): boolean {
    let result = !option.flip;

    if (option.flip) {
        let fullText = '';
        let currLine = '';
        for (const word of words) {
            const value = removeTag(word);

            currLine += value;

            if (getSize(currLine, option.font, option.size).width >= width) {
                result = true;
                break;
            }

            fullText += word;
        }

        if (fullText.includes('\n')) {
            result = true;
        }
    }

    return result;
}

export function getFinalContainerWidth(
    text: string,
    fullWidth: number,
    fullHeight: number,
    option: UnderwearOption,
): number {
    let result = fullWidth;

    const { width, height } = getSize(text, option.font, option.size);

    const underwearWidth = fullWidth * option.width;
    const underwearHeight = fullHeight * option.height;

    if (option.flip) {
        if (height - (fullHeight - height) * 0.2 < underwearHeight) {
            result = fullWidth * (1 - option.width);
        } else {
            result = fullWidth;
        }
    } else {
        const widthOverlap = (fullWidth - width) / 2 < underwearWidth;
        const heightOverlap = (fullHeight - height) < underwearHeight;

        if (widthOverlap && heightOverlap) {
            result = fullWidth * (1 - option.width);
        }
    }

    return result;
}
