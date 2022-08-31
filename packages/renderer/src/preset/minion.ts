import { CanvasRenderingContext2D, createCanvas, loadImage } from 'canvas';

import { EntityRenderData } from '../interface';

import { join } from 'path';
import { sum } from 'lodash';

import { renderRichText, RichTextOption } from '../components/rich-text';

import { materialPath } from '../index';

const fullSize = { width: 470, height: 660 };
const illusSize = { width: 334, height: 334 };

const position = {
    illustration: { x: 71, y: 55 },
    background:   {
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
    costNumber:   { x: 78, y: 105 },
    flag:         { x: 33, y: 70 },
    elite:        { x: 129, y: 22 },
    rarityBase:   { x: 193, y: 375 },
    rarity:       { x: 227, y: 385 },
    name:         { x: 63, y: 323 },
    nameText:     { x: 228, y: 351 },
    desc:         { x: 73, y: 408 },
    race:         { x: 129, y: 567 },
    raceText:     { x: 237, y: 584 },
    attack:       { x: 19, y: 507 },
    attackNumber: { x: 84, y: 575 },
    health:       { x: 359, y: 512 },
    healthNumber: { x: 397, y: 577 },

    watermark: {
        'classic': { x: 186, y: 439 },
        'hof':     { x: 172, y: 434 },
        'legacy':  { x: 186, y: 439 },
        'core21':  { x: 187, y: 451 },
        'core22':  { x: 186, y: 444 },

        'naxx':     { x: 172, y: 444 },
        'gvg':      { x: 177, y: 439 },
        'brm':      { x: 162, y: 450 },
        'tgt':      { x: 185, y: 446 },
        'loe':      { x: 174, y: 461 },
        'wog':      { x: 190, y: 446 },
        'onk':      { x: 200, y: 446 },
        'msg':      { x: 167, y: 441 },
        'jug':      { x: 188, y: 443 },
        'kft':      { x: 198, y: 438 },
        'knc':      { x: 203, y: 441 },
        'tww':      { x: 170, y: 443 },
        'tbp':      { x: 172, y: 444 },
        'rkr':      { x: 165, y: 444 },
        'ros':      { x: 170, y: 432 },
        'sou':      { x: 171, y: 446 },
        'dod':      { x: 166, y: 439 },
        'gra':      { x: 167, y: 444 },
        'aoo':      { x: 173, y: 444 },
        'dhi':      { x: 193, y: 450 },
        'sma':      { x: 162, y: 451 },
        'mdf':      { x: 183, y: 446 },
        'mdf-mini': { x: 171, y: 438 },
        'fib':      { x: 193, y: 444 },
        'fib-mini': { x: 177, y: 446 },
        'uis':      { x: 191, y: 446 },
        'uis-mini': { x: 180, y: 446 },
        'fav':      { x: 198, y: 441 },
        'fav-mini': { x: 181, y: 446 },
        'vsc':      { x: 190, y: 446 },
        'vsc-mini': { x: 181, y: 446 },
        'mcn':      { x: 190, y: 447 },

        'van': { x: 162, y: 451 },
    } as Record<string, { x: number, y: number }>,
};

const raceMap: Record<string, Record<string, string>> = {
    all: {
        zhs: '全部',
    },
    beast: {
        zhs: '野兽',
    },
    bloodelf: {
        zhs: '血精灵',
    },
    centaur: {
        zhs: '半人马',
    },
    demon: {
        zhs: '恶魔',
    },
    draenei: {
        zhs: '德莱尼',
    },
    dragon: {
        zhs: '龙',
    },
    dwarf: {
        zhs: '矮人',
    },
    egg: {
        zhs: '卵',
    },
    elemental: {
        zhs: '元素',
    },
    furbolg: {
        zhs: '熊怪',
    },
    gnome: {
        zhs: '侏儒',
    },
    goblin: {
        zhs: '地精',
    },
    halforc: {
        zhs: '半兽人',
    },
    human: {
        zhs: '人类',
    },
    mech: {
        zhs: '机械',
    },
    murloc: {
        zhs: '鱼人',
    },
    naga: {
        zhs: '纳迦',
    },
    nerubian: {
        zhs: '蛛魔',
    },
    nightelf: {
        zhs: '暗夜精灵',
    },
    ogre: {
        zhs: '食人魔',
    },
    orc: {
        zhs: '兽人',
    },
    pirate: {
        zhs: '海盗',
    },
    quilboar: {
        zhs: '野猪人',
    },
    scourge: {
        zhs: '灾祸',
    },
    tauren: {
        zhs: '牛头人',
    },
    totem: {
        zhs: '图腾',
    },
    treant: {
        zhs: '树人',
    },
    troll: {
        zhs: '巨魔',
    },
    undead: {
        zhs: '亡灵',
    },
    worgen: {
        zhs: '狼人',
    },
};

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

type RichTextComponent = Omit<RichTextOption, 'lang'> & { type: 'rich-text', text: string };

type CustomComponent = {
    type: 'custom';
    pos?: { x: number, y: number };
    action: (ctx: CanvasRenderingContext2D, pos?: { x: number, y: number }) => void;
};

type Component = CurveTextComponent | CustomComponent | ImageComponent | RichTextComponent | TextComponent;

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
        const panelWidth = 320;
        const fontCvs = createCanvas(panelWidth * 2, 112);
        const fontCtx = fontCvs.getContext('2d');

        fontCtx.textBaseline = 'ideographic';
        fontCtx.textAlign = 'center';

        let { size } = c;
        let sizes = [];

        do {
            size -= 1;

            fontCtx.font = `${size}px "${c.font}"`;

            sizes = c.text.split('').map(w => fontCtx.measureText(w).width);
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

export default async function renderMinion(
    data: EntityRenderData,
    asset: string,
): Promise<Buffer> {
    const canvas = createCanvas(fullSize.width, fullSize.height);

    const components: Component[] = [];

    // illustration
    components.push({
        type:  'image',
        image: join('..', 'card', 'illustration', `${data.cardId}.jpg`),
        pos:   position.illustration,
        size:  illusSize,
        clip(ctx) {
            ctx.ellipse(236, 223, 117, 160, 0, 0, 2 * Math.PI);
        },
    });

    // background
    const backgroundPath = join('minion', 'background');

    switch (data.classes.length) {
    case 1:
        components.push({
            type:  'image',
            image: join(backgroundPath, 'full', `${data.classes[0]}.png`),
            pos:   position.background.full,
        });
        break;
    case 2:
        components.push(
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
        );
        break;
    default:
        components.push({
            type:  'image',
            image: join(backgroundPath, 'full', 'neutral.png'),
            pos:   position.background.full,
        });
    }

    // cost
    components.push({
        type:  'image',
        image: join('cost', `${data.costType}.png`),
        pos:   position.cost[data.costType],
    });

    if (data.cost != null) {
        components.push({
            type: 'text',
            text: data.cost.toString(),
            font: '文鼎隶书',
            size: 114,
            pos:  position.costNumber,
        });
    }

    // flag
    if (data.mechanics.includes('tradable')) {
        components.push({
            type:  'image',
            image: join('flag', 'tradeable.png'),
            pos:   position.flag,
        });
    }

    // elite
    if (data.elite) {
        components.push({
            type:  'image',
            image: join('minion', 'elite.png'),
            pos:   position.elite,
        });
    }

    // name
    components.push(
        {
            type:  'image',
            image: join('minion', 'name.png'),
            pos:   position.name,
        },
        {
            type:   'curve-text',
            text:   data.name,
            font:   '文鼎隶书',
            size:   35,
            pos:    position.nameText,
            middle: 0.55,
            curve:  [{ x: 0, y: 62 }, { x: 69, y: 79 }, { x: 206, y: 10 }, { x: 322, y: 56 }],
        },
    );

    // text
    components.push({
        type:  'image',
        image: join('minion', 'text.png'),
        pos:   position.desc,
    });

    if (position.watermark[data.set] != null) {
        components.push(
            {
                type: 'custom',
                action(ctx) {
                    ctx.globalCompositeOperation = 'multiply';
                },
            },
            {
                type:  'image',
                image: join('watermark', `${data.set}.png`),
                pos:   {
                    x: position.watermark[data.set].x,
                    y: position.watermark[data.set].y - (data.race != null ? 10 : 0),
                },
            },
            {
                type: 'custom',
                action(ctx) {
                    ctx.globalCompositeOperation = 'source-over';
                },
            },
        );
    }

    components.push({
        type:      'rich-text',
        text:      data.rawText ?? '',
        font:      'BlizzardGlobal',
        size:      30,
        minSize:   20,
        shape:     [{ x: 87, y: 434 }, { x: 388, y: 566 }],
        underwear: { flip: false, width: 0.25, height: 0.35 },
        color:     '#1E1710',
    });

    // rarity
    if (data.rarity != null && data.rarity !== 'free') {
        components.push(
            {
                type:  'image',
                image: join('minion', 'rarity.png'),
                pos:   position.rarityBase,
            },
            {
                type:  'image',
                image: join('rarity', `${data.rarity}.png`),
                pos:   position.rarity,
            },
        );
    }

    // race
    if (data.race != null) {
        const race = raceMap[data.race];

        const raceText = race?.[data.lang] ?? race?.en ?? data.race;

        components.push(

            {
                type:  'image',
                image: join('minion', 'race.png'),
                pos:   position.race,
            },
            {
                type: 'text',
                text: raceText,
                font: '文鼎隶书',
                size: 32,
                pos:  position.raceText,
            },
        );
    }

    // stats
    components.push(
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
    );

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
