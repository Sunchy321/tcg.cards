import { createCanvas } from 'canvas';

import { EntityRenderData } from '../interface';
import { Component, RichTextComponent, renderComponent } from '../components';

import { join } from 'path';

import { materialPath } from '../index';

const fullSize = { width: 490, height: 660 };
const illusSize = { width: 252, height: 252 };

const nameCurve = [{ x: 24, y: 98 }, { x: 170, y: 36 }, { x: 294, y: 36 }, { x: 438, y: 96 }];
const textShape = [{ x: 114, y: 427 }, { x: 373, y: 560 }] as RichTextComponent['shape'];

const position = {
    illustration: { x: 121, y: 83 },
    illusShadow:  { x: 137, y: 82 },
    background:   {
        full:  { x: 56, y: 46 },
        left:  { x: 56, y: 46 },
        right: { x: 246, y: 46 },
        split: { x: 242, y: 360 },
    },
    cost: {
        mana: { x: 38, y: 61 },
        coin: { x: 37, y: 62 },
    },
    costNumber:   { x: 88, y: 105 },
    flag:         { x: 43, y: 70 },
    elite:        { x: 128, y: 11 },
    rarityBase:   { x: 187, y: 368 },
    rarity:       { x: 231, y: 379 },
    name:         { x: 72, y: 316 },
    nameText:     { x: 244, y: 362 },
    desc:         { x: 78, y: 381 },
    attack:       { x: 29, y: 507 },
    attackNumber: { x: 94, y: 573 },
    armor:        { x: 366, y: 531 },
    health:       { x: 369, y: 512 },
    armorNumber:  { x: 406, y: 575 },

    watermark: {
        'classic': { x: 194, y: 434 },
        'hof':     { x: 180, y: 429 },
        'legacy':  { x: 194, y: 434 },
        'core21':  { x: 194, y: 446 },
        'core22':  { x: 193, y: 438 },

        'naxx':     { x: 180, y: 439 },
        'gvg':      { x: 185, y: 434 },
        'brm':      { x: 170, y: 444 },
        'tgt':      { x: 193, y: 440 },
        'loe':      { x: 181, y: 455 },
        'wog':      { x: 198, y: 440 },
        'onk':      { x: 208, y: 440 },
        'msg':      { x: 175, y: 435 },
        'jug':      { x: 195, y: 438 },
        'kft':      { x: 205, y: 433 },
        'knc':      { x: 210, y: 435 },
        'tww':      { x: 178, y: 438 },
        'tbp':      { x: 180, y: 439 },
        'rkr':      { x: 173, y: 439 },
        'ros':      { x: 178, y: 426 },
        'sou':      { x: 179, y: 440 },
        'dod':      { x: 174, y: 434 },
        'gra':      { x: 175, y: 438 },
        'aoo':      { x: 200, y: 444 },
        'dhi':      { x: 186, y: 438 },
        'sma':      { x: 170, y: 445 },
        'mdf':      { x: 190, y: 440 },
        'mdf-mini': { x: 179, y: 433 },
        'fib':      { x: 200, y: 439 },
        'fib-mini': { x: 185, y: 439 },
        'uis':      { x: 198, y: 439 },
        'uis-mini': { x: 187, y: 439 },
        'fav':      { x: 204, y: 435 },
        'fav-mini': { x: 187, y: 439 },
        'vsc':      { x: 197, y: 439 },
        'vsc-mini': { x: 187, y: 439 },
        'mcn':      { x: 197, y: 440 },

        'van': { x: 170, y: 445 },
    } as Record<string, { x: number, y: number }>,
};

export default async function renderHero(
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
        // clip omitted.
    });

    components.push({
        type:  'image',
        image: join('hero', 'illus-shadow.png'),
        pos:   position.illusShadow,
    });

    // background
    const backgroundPath = join('hero', 'background');

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
            image: join('hero', 'elite.png'),
            pos:   position.elite,
        });
    }

    // cost
    components.push({
        type:  'image',
        image: join('cost', `${data.costType}.png`),
        pos:   position.cost[data.costType === 'speed' ? 'mana' : data.costType],
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

    // text
    components.push({
        type:  'image',
        image: join('hero', 'text.png'),
        pos:   position.desc,
    });

    // rarity
    if (data.rarity != null && data.rarity !== 'free') {
        components.push(
            {
                type:  'image',
                image: join('hero', 'rarity.png'),
                pos:   position.rarityBase,
            },
            {
                type:  'image',
                image: join('hero', 'rarity', `${data.rarity}.png`),
                pos:   position.rarity,
            },
        );
    }

    // name
    components.push(
        {
            type:  'image',
            image: join('hero', 'name.png'),
            pos:   position.name,
        },
        {
            type:   'curve-text',
            text:   data.name,
            font:   '文鼎隶书',
            size:   35,
            pos:    position.nameText,
            middle: 0.5,
            curve:  nameCurve,
        },
    );

    // text
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
                image: join('hero', 'watermark', `${data.set}.png`),
                pos:   position.watermark[data.set],
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
        text:      data.text,
        font:      'BlizzardGlobal',
        size:      31,
        minSize:   20,
        shape:     textShape,
        underwear: { flip: false, width: 0.27, height: 0.17 },
        color:     '#000000',
    });

    // stats
    if (data.attack != null) {
        components.push(
            {
                type:  'image',
                image: join('hero', 'attack.png'),
                pos:   position.attack,
            },
            {
                type: 'text',
                text: data.attack.toString(),
                font: '文鼎隶书',
                size: 106,
                pos:  position.attackNumber,
            },
        );
    }

    if (data.armor != null) {
        components.push(
            {
                type:  'image',
                image: join('hero', 'armor.png'),
                pos:   position.armor,
            },
            {
                type: 'text',
                text: data.armor.toString(),
                font: '文鼎隶书',
                size: 106,
                pos:  position.armorNumber,
            },
        );
    } else if (data.health != null) {
        components.push(
            {
                type:  'image',
                image: join('hero', 'health.png'),
                pos:   position.health,
            },
            {
                type: 'text',
                text: data.health.toString(),
                font: '文鼎隶书',
                size: 106,
                pos:  position.armorNumber,
            },
        );
    }

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
