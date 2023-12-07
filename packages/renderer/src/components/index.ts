import { renderRichText, RichTextOption } from './rich-text';

import { CanvasRenderingContext2D, createCanvas, loadImage } from 'canvas';
import { sum } from 'lodash';

type ImageComponent = {
    type: 'image';
    image: string;
    pos: { x: number, y: number };
    size?: { width: number, height: number };
    clip?: (ctx: CanvasRenderingContext2D) => void;
};

type TextComponent = {
    type: 'text';
    text: string;
    font: string;
    size: number;
    pos: { x: number, y: number };
};

type CurveTextComponent = {
    type: 'curve-text';
    text: string;
    font: string;
    size: number;
    pos: { x: number, y: number };
    middle: number;
    curve: { x: number, y: number }[];
};

export type RichTextComponent = Omit<RichTextOption, 'lang'> & { type: 'rich-text', text: string };

type CustomComponent = {
    type: 'custom';
    pos?: { x: number, y: number };
    action: (ctx: CanvasRenderingContext2D, pos?: { x: number, y: number }) => void;
};

export type Component = CurveTextComponent | CustomComponent | ImageComponent | RichTextComponent | TextComponent;

function getPointOnCurve(curve: { x: number, y: number }[], t: number): { x: number, y: number, r: number } {
    const rX = 3 * (1 - t) ** 2 * (curve[1].x - curve[0].x)
        + 6 * (1 - t) * t * (curve[2].x - curve[1].x)
        + 3 * t ** 2 * (curve[3].x - curve[2].x);
    const rY = 3 * (1 - t) ** 2 * (curve[1].y - curve[0].y)
        + 6 * (1 - t) * t * (curve[2].y - curve[1].y)
        + 3 * t ** 2 * (curve[3].y - curve[2].y);

    const x = (1 - t) ** 3 * curve[0].x
        + 3 * (1 - t) ** 2 * t * curve[1].x
        + 3 * (1 - t) * t ** 2 * curve[2].x
        + t ** 3 * curve[3].x;
    const y = (1 - t) ** 3 * curve[0].y
        + 3 * (1 - t) ** 2 * t * curve[1].y
        + 3 * (1 - t) * t ** 2 * curve[2].y
        + t ** 3 * curve[3].y;

    return { x, y, r: Math.atan2(rY, rX) };
}

export async function renderComponent(ctx: CanvasRenderingContext2D, c: Component): Promise<void> {
    if (c.type === 'image') {
        const image = await loadImage(c.image);

        if (c.clip) {
            ctx.save();
            c.clip(ctx);
            ctx.clip();
        }

        if (c.size != null) {
            ctx.drawImage(image, c.pos.x, c.pos.y, c.size.width, c.size.height);
        } else {
            ctx.drawImage(image, c.pos.x, c.pos.y);
        }

        if (c.clip) {
            ctx.restore();
        }
    } else if (c.type === 'text') {
        ctx.font = `${c.size}px "${c.font}"`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.lineWidth = 5;
        ctx.strokeStyle = '#000';
        ctx.strokeText(c.text, c.pos.x, c.pos.y);

        ctx.fillStyle = '#fff';
        ctx.fillText(c.text, c.pos.x, c.pos.y);
    } else if (c.type === 'curve-text') {
        const panelWidth = 460;
        const fontCvs = createCanvas(panelWidth, 160);
        const fontCtx = fontCvs.getContext('2d');

        fontCtx.textBaseline = 'ideographic';
        fontCtx.textAlign = 'center';

        let { size } = c;
        let sizes = [];

        do {
            size -= 1;

            fontCtx.font = `${size}px "${c.font}"`;

            sizes = (c.text ?? '').split('').map(w => fontCtx.measureText(w).width);
        } while (sum(sizes) > panelWidth && size > 10);

        const xCenter = c.middle * panelWidth;
        const xSum = sum(sizes);

        for (let i = 0; i < c.text.length; i += 1) {
            const dx = sum(sizes.slice(0, i))
                + sizes[i] / 2
                - xSum / 2;

            const { x, y, r } = getPointOnCurve(c.curve, (xCenter + dx) / panelWidth);

            fontCtx.save();
            fontCtx.translate(x, y);
            fontCtx.rotate(r);

            fontCtx.lineWidth = 5;
            fontCtx.strokeStyle = '#000';
            fontCtx.strokeText(c.text[i], 0, 0);

            fontCtx.fillStyle = '#fff';
            fontCtx.fillText(c.text[i], 0, 0);

            fontCtx.restore();
        }

        ctx.drawImage(fontCvs, c.pos.x - panelWidth / 2, c.pos.y - fontCvs.height / 2);
    } else if (c.type === 'rich-text') {
        renderRichText(ctx, c.text, { lang: 'zhs', ...c });
    } else {
        c.action(ctx, c.pos);
    }
}
