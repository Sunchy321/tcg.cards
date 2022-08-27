import { createCanvas } from 'canvas';

import { removeTag } from './rich-text/remove-tag';

export function getLineCount(text: string): number {
    return text.split('').filter(v => v === '\n').length + 1;
}

export function getSize(
    text: string,
    font: string,
    size: number,
    lineSpacing: number,
    rich = true,
): { width: number, height: number } {
    const canvas = createCanvas(100, 100);

    const ctx = canvas.getContext('2d');

    ctx.font = `${size}px ${font}`;

    if (rich) {
        text = removeTag(text);
    }

    let width = 0;
    let height = 0;

    for (const l of text.split('\n')) {
        const measure = ctx.measureText(l);

        width = Math.max(measure.width, width);

        // const lineHeight = measure.actualBoundingBoxAscent + measure.actualBoundingBoxDescent;

        height += height === 0 ? size : size + lineSpacing;
    }

    return { width, height };
}
