import { CanvasRenderingContext2D, createCanvas } from 'canvas';

import { getLineSpacing, getSize } from '../../util';

import { wrapString } from './wrap-string';
import { resizeToFit } from './resize-to-fit';

export type RichTextOption = {
    lang: string;
    font: string;
    size: number;
    minSize: number;
    shape: [{ x: number, y: number }, { x: number, y: number }];
    underwear: { flip: boolean, width: number, height: number };
    color: string;
};

export const lineSpacing = 3;

export function renderRichText(ctx: CanvasRenderingContext2D, text: string, option: RichTextOption): void {
    const fullWidth = option.shape[1].x - option.shape[0].x;
    const fullHeight = option.shape[1].y - option.shape[0].y;

    const size = resizeToFit(text, option.size, fullWidth, fullHeight, {
        lang:      option.lang,
        font:      option.font,
        minSize:   option.minSize,
        shape:     option.shape,
        underwear: option.underwear,
    });

    const wrapText = wrapString(text, { ...option, size });

    const { width, height } = getSize(wrapText, option.font, size);

    const textCvs = createCanvas(width * 2, height * 2);
    const textCtx = textCvs.getContext('2d');

    textCtx.textAlign = 'center';
    textCtx.textBaseline = 'middle';

    let bold = false;
    let italic = false;

    for (const [i, l] of wrapText.split('\n').entries()) {
        const lineWidth = getSize(l, option.font, size).width;

        let xBase = (width - lineWidth) / 2;
        const y = i * (size + getLineSpacing(size)) + size / 2;

        let tag = null;

        for (const c of l) {
            if (c === '<') {
                tag = '';
            } else if (c === '>') {
                switch (tag) {
                case 'b':
                    bold = true;
                    break;
                case '/b':
                    bold = false;
                    break;
                case 'i':
                    italic = true;
                    break;
                case '/i':
                    italic = false;
                    break;
                default:
                    break;
                }
                tag = null;
            } else if (tag != null) {
                tag += c;
            } else {
                const charWidth = getSize(c, option.font, size, false).width;

                const x = xBase + charWidth / 2;

                const font = `${bold ? 'bold' : ''} ${italic ? 'italic' : ''} ${size}px ${option.font}`;

                textCtx.fillStyle = option.color;
                textCtx.font = font;
                textCtx.fillText(c, x, y);

                xBase += charWidth;
            }
        }
    }

    ctx.drawImage(
        textCvs,
        option.shape[0].x + (fullWidth - width) / 2,
        option.shape[0].y + (fullHeight - height) / 2,
    );
}
