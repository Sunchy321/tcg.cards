import { createCanvas } from 'canvas';

import { EntityRenderData } from '../interface';
import { Component, RichTextComponent, renderComponent } from '../components';

import { join } from 'path';

import { materialPath } from '../index';
import raceMap from '../localization/race';

const fullSize = { width: 490, height: 660 };
const illusSize = { width: 334, height: 334 };

const illusShape = {
    x: 246, y: 223, rx: 117, ry: 160,
};

const nameCurve = [{ x: 10, y: 62 }, { x: 79, y: 79 }, { x: 216, y: 10 }, { x: 332, y: 56 }];
const textShape = [{ x: 97, y: 434 }, { x: 398, y: 566 }] as RichTextComponent['shape'];

const position = {
    illustration: { x: 81, y: 55 },
    illusShadow:  { x: 130, y: 64 },
    background:   {
        full:  { x: 56, y: 48 },
        left:  { x: 56, y: 48 },
        right: { x: 246, y: 48 },
        split: { x: 238, y: 397 },
    },
    cost: {
        mana:  { x: 38, y: 61 },
        coin:  { x: 37, y: 62 },
        speed: { x: 44, y: 57 },
    },
    costNumber:   { x: 88, y: 105 },
    flag:         { x: 43, y: 70 },
    elite:        { x: 139, y: 22 },
    rarityBase:   { x: 203, y: 375 },
    rarity:       { x: 237, y: 385 },
    name:         { x: 73, y: 323 },
    nameText:     { x: 238, y: 351 },
    desc:         { x: 83, y: 408 },
    race:         { x: 139, y: 567 },
    raceText:     { x: 247, y: 584 },
    attack:       { x: 29, y: 507 },
    attackNumber: { x: 94, y: 575 },
    health:       { x: 369, y: 512 },
    healthNumber: { x: 407, y: 577 },

    watermark: {
        'classic': { x: 196, y: 439 },
        'hof':     { x: 182, y: 434 },
        'legacy':  { x: 196, y: 439 },
        'core21':  { x: 197, y: 451 },
        'core22':  { x: 196, y: 444 },

        'naxx':     { x: 182, y: 444 },
        'gvg':      { x: 187, y: 439 },
        'brm':      { x: 172, y: 450 },
        'tgt':      { x: 195, y: 446 },
        'loe':      { x: 184, y: 461 },
        'wog':      { x: 200, y: 446 },
        'onk':      { x: 210, y: 446 },
        'msg':      { x: 177, y: 441 },
        'jug':      { x: 198, y: 443 },
        'kft':      { x: 208, y: 438 },
        'knc':      { x: 213, y: 441 },
        'tww':      { x: 180, y: 443 },
        'tbp':      { x: 182, y: 444 },
        'rkr':      { x: 175, y: 444 },
        'ros':      { x: 180, y: 432 },
        'sou':      { x: 181, y: 446 },
        'dod':      { x: 176, y: 439 },
        'gra':      { x: 177, y: 444 },
        'aoo':      { x: 183, y: 444 },
        'dhi':      { x: 203, y: 450 },
        'sma':      { x: 172, y: 451 },
        'mdf':      { x: 193, y: 446 },
        'mdf-mini': { x: 181, y: 438 },
        'fib':      { x: 203, y: 444 },
        'fib-mini': { x: 187, y: 446 },
        'uis':      { x: 201, y: 446 },
        'uis-mini': { x: 190, y: 446 },
        'fav':      { x: 208, y: 441 },
        'fav-mini': { x: 191, y: 446 },
        'vsc':      { x: 200, y: 446 },
        'vsc-mini': { x: 191, y: 446 },
        'mcn':      { x: 200, y: 447 },

        'van': { x: 172, y: 451 },
    } as Record<string, { x: number, y: number }>,
};

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
            ctx.ellipse(illusShape.x, illusShape.y, illusShape.rx, illusShape.ry, 0, 0, 2 * Math.PI);
        },
    });

    components.push({
        type:  'image',
        image: join('minion', 'illus-shadow.png'),
        pos:   position.illusShadow,
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
            curve:  nameCurve,
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
        size:      31,
        minSize:   20,
        shape:     textShape,
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
