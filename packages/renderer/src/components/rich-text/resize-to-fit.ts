import { UnderwearOption } from './underwear';

import { getSize } from '../../util';

import { wrapString } from './wrap-string';

export type ResizeToFitOption = {
    lang: string;
    font: string;
    minSize: number;
    shape: [{ x: number, y: number }, { x: number, y: number }];
    underwear: Omit<UnderwearOption, 'font' | 'size'>;
};

export function resizeToFit(
    text: string,
    size: number,
    fullWidth: number,
    fullHeight: number,
    option: ResizeToFitOption,
): number {
    let tryCount = 0;
    let width; let height;

    do {
        const wrapText = wrapString(text, {
            lang:      option.lang,
            font:      option.font,
            size,
            shape:     option.shape,
            underwear: option.underwear,
        });

        ({ width, height } = getSize(wrapText, option.font, size));

        if (height <= fullHeight && width <= fullWidth) {
            break;
        }

        tryCount += 1;

        if (tryCount >= 40) {
            break;
        }

        size = Math.floor(size * 0.95);

        if (size <= option.minSize) {
            size = option.minSize;
            break;
        }
    } while (size >= option.minSize);

    return size;
}
