import { CanvasRenderingContext2D, createCanvas, loadImage } from 'canvas';

import { EntityRenderData } from '../interface';

import { join } from 'path';

import { materialPath } from '../index';

const size = {
    image: { width: 470, height: 660 },
    cost:  { width: 51, height: 74 },
};

const position = {
    background: {
        full:  { x: 46, y: 48 },
        left:  { x: 46, y: 48 },
        right: { x: 236, y: 48 },
        split: { x: 228, y: 397 },

    },
    cost: {
        mana:  { x: 28, y: 61 },
        coin:  { x: 27, y: 62 },
        speed: { x: 34, y: 57 },
    },
    costNumber:   { x: 78, y: 48 },
    attack:       { x: 19, y: 507 },
    attackNumber: { x: 84, y: 520 },
    health:       { x: 359, y: 512 },
    healthNumber: { x: 397, y: 522 },
    name:         { x: 63, y: 323 },
    nameText:     { x: 228, y: 351 },
};

type ImageComponent = {
    type: 'image';
    image: string;
    pos: { x: number, y: number };
};

type TextComponent = {
    type: 'text';
    text: string;
    font: string;
    size: number;
    pos: { x: number, y: number };
};

type TextCurveComponent = {
    type: 'text-curve';
    text: string;
    font: string;
    size: number;
    pos: { x: number, y: number };
    middle: number;
    curve: { x: number, y: number }[];
};

type CustomComponent = {
    type: 'custom';
    pos: { x: number, y: number };
    action: (ctx: CanvasRenderingContext2D, pos: { x: number, y: number }) => void;
};

type Component = CustomComponent | ImageComponent | TextComponent | TextCurveComponent;

// Come from Sunwell
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

async function renderComponent(
    ctx: CanvasRenderingContext2D,
    c: Component,
): Promise<void> {
    if (c.type === 'image') {
        const image = await loadImage(c.image);

        ctx.drawImage(image, c.pos.x, c.pos.y);
    } else if (c.type === 'text') {
        ctx.font = `${c.size}px "${c.font}"`;
        ctx.textBaseline = 'ideographic';
        ctx.textAlign = 'center';

        ctx.lineWidth = 5;
        ctx.strokeStyle = '#000';
        ctx.strokeText(c.text, c.pos.x, c.pos.y);

        ctx.fillStyle = '#fff';
        ctx.fillText(c.text, c.pos.x, c.pos.y);
    } else if (c.type === 'text-curve') {
        const panelWidth = 320;
        const fontCvs = createCanvas(panelWidth * 2, 112);
        const fontCtx = fontCvs.getContext('2d');

        fontCtx.textBaseline = 'ideographic';
        fontCtx.textAlign = 'center';

        let fontSize = c.size;
        let sizes = [];

        do {
            fontSize -= 1;

            fontCtx.font = `${fontSize}px "${c.font}"`;

            sizes = c.text.split('').map(w => fontCtx.measureText(w).width);
        } while (sizes.reduce((a, b) => a + b, 0) > panelWidth && fontSize > 10);

        const xCenter = c.middle * panelWidth;
        const xSum = sizes.reduce((a, b) => a + b, 0);

        for (let i = 0; i < c.text.length; i += 1) {
            const dx = sizes.slice(0, i).reduce((a, b) => a + b, 0)
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
    } else {
        c.action(ctx, c.pos);
    }
}

function getBackground(data: EntityRenderData): Component[] {
    const backgroundPath = join('minion', 'background');

    switch (data.classes.length) {
    case 1:
        return [{
            type:  'image',
            image: join(backgroundPath, 'full', `${data.classes[0]}.png`),
            pos:   position.background.full,
        }];
    case 2:
        return [
            {
                type:  'image',
                image: join(backgroundPath, 'left', `${data.classes[0]}.png`),
                pos:   position.background.left,
            },
            {
                type:  'image',
                image: join(backgroundPath, 'right', `${data.classes[1]}.png`),
                pos:   position.background.right,
            },
            {
                type:  'image',
                image: join(backgroundPath, 'split.png'),
                pos:   position.background.split,
            },
        ];
    default:
        return [{
            type:  'image',
            image: join(backgroundPath, 'full', 'neutral.png'),
            pos:   position.background.full,
        }];
    }
}

function getCost(data: EntityRenderData): Component[] {
    return [
        {
            type:  'image',
            image: join('minion', 'cost', `${data.costType}.png`),
            pos:   position.cost[data.costType],
        },

        ...data.cost != null ? [{
            type: 'text',
            text: data.cost.toString(),
            font: '文鼎隶书',
            size: 114,
            pos:  position.costNumber,
        }] as Component[] : [],
    ];
}

function getBanner(data: EntityRenderData): Component[ ] {
    return [

    ];
}

function getStats(data: EntityRenderData): Component[] {
    return [
        {
            type:  'image',
            image: join('minion', 'attack.png'),
            pos:   position.attack,
        },
        ...data.attack != null ? [{
            type: 'text',
            text: data.attack!.toString(),
            font: '文鼎隶书',
            size: 106,
            pos:  position.attackNumber,
        }] as Component[] : [],
        {
            type:  'image',
            image: join('minion', 'health.png'),
            pos:   position.health,
        },
        ...data.health != null ? [{
            type: 'text',
            text: data.health!.toString(),
            font: '文鼎隶书',
            size: 106,
            pos:  position.healthNumber,
        }] as Component[] : [],
    ];
}

function getName(data: EntityRenderData): Component[] {
    return [
        {
            type:  'image',
            image: join('minion', 'name.png'),
            pos:   position.name,
        },
        {
            type:   'text-curve',
            text:   data.name,
            font:   '文鼎隶书',
            size:   45,
            pos:    position.nameText,
            middle: 0.55,
            curve:  [{ x: 0, y: 62 }, { x: 69, y: 79 }, { x: 206, y: 10 }, { x: 322, y: 56 }],
        },
    ];
}

export default async function renderMinion(
    data: EntityRenderData,
    asset: string,
): Promise<Buffer> {
    const canvas = createCanvas(size.image.width, size.image.height);

    const components = [
        ...getBackground(data),
        ...getBanner(data),
        ...getCost(data),
        ...getStats(data),
        ...getName(data),
    ];

    const ctx = canvas.getContext('2d');

    for (const c of components) {
        if (c.type === 'image') {
            await renderComponent(ctx, {
                ...c,
                image: join(materialPath(asset), c.image),
            });
        } else {
            await renderComponent(ctx, c);
        }
    }

    return canvas.toBuffer();
}
