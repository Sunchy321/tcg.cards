import { createCanvas } from 'canvas';

import { EntityRenderData } from '../interface';
import { Adjustment } from '@interface/hearthstone/format-change';
import { Component, RichTextComponent, renderComponent } from '../components';

import { join } from 'path';

import { materialPath } from '../index';

const fullSize = { width: 490, height: 660 };
const illusSize = { width: 334, height: 334 };

const illusShape = {
    poly: [
        { x: 245, y: 30 },
        { x: 440, y: 100 },
        { x: 440, y: 350 },
        { x: 50, y: 350 },
        { x: 50, y: 100 },
    ],
};

const nameCurve = [{ x: 0, y: 36 }, { x: 98, y: 78 }, { x: 294, y: 78 }, { x: 460, y: 36 }];
const textShape = [{ x: 97, y: 434 }, { x: 398, y: 566 }] as RichTextComponent['shape'];

const position = {
    illustration: { x: 81, y: 45 },
    illusShadow:  { x: 81, y: 64 },
    illusFrame:   { x: 49, y: 13 },
    background:   {
        full:  { x: 47, y: 260 },
        left:  { x: 56, y: 48 },
        right: { x: 246, y: 48 },
        split: { x: 238, y: 397 },
    },
    cost: {
        mana:  { x: 38, y: 61 },
        coin:  { x: 37, y: 62 },
        speed: { x: 44, y: 57 },
    },
    costNumber:       { x: 88, y: 105 },
    flag:             { x: 43, y: 70 },
    elite:            { x: 139, y: 22 },
    rarityBase:       { x: 212, y: 392 },
    rarity:           { x: 228, y: 390 },
    name:             { x: 73, y: 323 },
    nameText:         { x: 248, y: 362 },
    desc:             { x: 83, y: 408 },
    durability:       { x: 362, y: 529 },
    durabilityNumber: { x: 408, y: 582 },

    adjustment: {
        mana: {
            buff: { x: 24, y: 24 },
            nerf: { x: 23, y: 45 },
        },
        coin: {
            buff: { x: 20, y: 46 },
            nerf: { x: 22, y: 47 },
        },
        attack: {
            buff: { x: 16, y: 491 },
            nerf: { x: 14, y: 493 },
        },
        health: {
            buff: { x: 354, y: 470 },
            nerf: { x: 355, y: 499 },
        },
        text: {
            buff:   { x: 68, y: 372 },
            nerf:   { x: 71, y: 399 },
            adjust: { x: 69, y: 397 },
        },
        race: {
            adjust: { x: 144, y: 561 },
        },
    } as Record<string, Partial<Record<Adjustment, { x: number, y: number }>>>,

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
        image: join('..', 'card', 'illustration', 'jpg', `${data.entityId}.jpg`),
        pos:   position.illustration,
        size:  illusSize,
        clip(ctx) {
            ctx.beginPath();

            ctx.moveTo(illusShape.poly[0].x, illusShape.poly[0].y);

            for (const { x, y } of illusShape.poly.slice(1)) {
                ctx.lineTo(x, y);
            }

            ctx.closePath();
        },
    });

    components.push({
        type:  'image',
        image: join('location', 'illus-shadow.png'),
        pos:   position.illusShadow,
    });

    components.push({
        type:  'image',
        image: join('location', 'illus-frame.png'),
        pos:   position.illusFrame,
    });

    // background
    const backgroundPath = join('location', 'background');

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
            image: join('minion', 'elite.png'),
            pos:   position.elite,
        });
    }

    // cost
    const aCost = (data.adjustment ?? []).find(a => a.part === 'cost');

    const costType = (() => {
        if (data.format === 'mercenaries') {
            return 'speed';
        } else if (data.format != null) {
            return 'mana';
        } else {
            return data.costType ?? 'mana';
        }
    })();

    if (aCost?.status === 'nerf') {
        components.push({
            type:  'image',
            image: join('cost', 'effect', `${costType}-nerf.png`),
            pos:   position.adjustment[costType].nerf!,
        });
    } else {
        components.push({
            type:  'image',
            image: join('cost', `${costType}.png`),
            pos:   position.cost[costType],
        });

        if (aCost?.status === 'buff') {
            components.push({
                type:  'image',
                image: join('cost', 'effect', `${costType}-buff.png`),
                pos:   position.adjustment[costType].buff!,
            });
        }
    }

    if (data.cost != null) {
        components.push({
            type: 'text',
            text: data.cost.toString(),
            font: '文鼎隶书',
            size: 114,
            pos:  position.costNumber,
        });
    }

    // name
    components.push(
        {
            type:  'image',
            image: join('location', 'name.png'),
            pos:   position.name,
        },
        {
            type:   'curve-text',
            text:   data.name ?? '',
            font:   '文鼎隶书',
            size:   35,
            pos:    position.nameText,
            middle: 0.55,
            curve:  nameCurve,
        },
    );

    // text
    // const aText = (data.adjustment ?? []).find(a => a.part === 'text');

    // if (aText?.status === 'nerf') {
    //     components.push({
    //         type:  'image',
    //         image: join('location', 'effect', 'text-nerf.png'),
    //         pos:   position.adjustment.text.nerf!,
    //     });
    // } else {
    //     components.push({
    //         type:  'image',
    //         image: join('location', 'text.png'),
    //         pos:   position.desc,
    //     });

    //     if (aText?.status === 'buff') {
    //         components.push({
    //             type:  'image',
    //             image: join('location', 'effect', 'text-buff.png'),
    //             pos:   position.adjustment.text.buff!,
    //         });
    //     } else if (aText?.status === 'adjust') {
    //         components.push({
    //             type:  'image',
    //             image: join('location', 'effect', 'text-adjust.png'),
    //             pos:   position.adjustment.text.adjust!,
    //         });
    //     }
    // }

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
                image: join('minion', 'watermark', `${data.set}.png`),
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
        text:      data.text,
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
                image: join('location', 'rarity.png'),
                pos:   position.rarityBase,
            },
            {
                type:  'image',
                image: join('location', 'rarity', `${data.rarity}.png`),
                pos:   position.rarity,
            },
        );
    }

    // durability
    const aDurability = (data.adjustment ?? []).find(a => a.part === 'durability');

    if (aDurability?.status === 'nerf') {
        components.push({
            type:  'image',
            image: join('location', 'effect', 'durability-nerf.png'),
            pos:   position.adjustment.durability.nerf!,
        });
    } else {
        components.push({
            type:  'image',
            image: join('location', 'durability.png'),
            pos:   position.durability,
        });

        if (aDurability?.status === 'buff') {
            components.push({
                type:  'image',
                image: join('location', 'effect', 'durability-buff.png'),
                pos:   position.adjustment.durability.buff!,
            });
        }
    }

    if (data.health != null) {
        components.push({
            type: 'text',
            text: data.health!.toString(),
            font: '文鼎隶书',
            size: 106,
            pos:  position.durabilityNumber,
        });
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
