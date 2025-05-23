import { createCanvas } from 'canvas';

import { EntityRenderData } from '../interface';
import { Adjustment } from '@interface/hearthstone/format-change';
import { Component, RichTextComponent, renderComponent } from '../components';

import { join } from 'path';

import { materialPath } from '../index';

const fullSize = { width: 490, height: 660 };
const illusSize = { width: 280, height: 280 };

const illusShape = { x: 249, y: 225, r: 130 };

const nameCurve = [{ x: 18, y: 56 }, { x: 164, y: 56 }, { x: 310, y: 56 }, { x: 456, y: 56 }];
const textShape = [{ x: 113, y: 437 }, { x: 372, y: 573 }] as RichTextComponent['shape'];

const position = {
    illustration: { x: 108, y: 85 },
    illusShadow:  { x: 117, y: 94 },
    background:   {
        full:  { x: 56, y: 65 },
        left:  { x: 56, y: 65 },
        right: { x: 246, y: 65 },
        split: { x: 235, y: 383 },
    },
    cost: {
        mana: { x: 38, y: 61 },
        coin: { x: 37, y: 62 },
    },
    costNumber: { x: 88, y: 105 },
    flag:       { x: 43, y: 70 },
    runeBase:   { x: 27, y: 116 },
    rune:       {
        basic: [
            {
                blood:  { x: 26, y: 156 },
                unholy: { x: 32, y: 163 },
                frost:  { x: 30, y: 162 },
            } as Record<string, { x: number, y: number }>,
            {
                blood:  { x: 64, y: 169 },
                unholy: { x: 70, y: 176 },
                frost:  { x: 68, y: 175 },
            } as Record<string, { x: number, y: number }>,
        ],
        full: [
            {
                blood:  { x: 29, y: 159 },
                unholy: { x: 34, y: 165 },
                frost:  { x: 32, y: 164 },
            } as Record<string, { x: number, y: number }>,
            {
                blood:  { x: 67, y: 172 },
                unholy: { x: 72, y: 178 },
                frost:  { x: 70, y: 177 },
            } as Record<string, { x: number, y: number }>,
            {
                blood:  { x: 103, y: 159 },
                unholy: { x: 108, y: 165 },
                frost:  { x: 106, y: 164 },
            } as Record<string, { x: number, y: number }>,
        ],
    },
    elite:            { x: 142, y: 33 },
    rarityBase:       { x: 216, y: 364 },
    rarity:           { x: 234, y: 385 },
    name:             { x: 60, y: 317 },
    nameText:         { x: 246, y: 351 },
    attack:           { x: 44, y: 535 },
    attackNumber:     { x: 94, y: 579 },
    durability:       { x: 362, y: 528 },
    durabilityNumber: { x: 408, y: 577 },

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
            buff: { x: 36, y: 511 },
            nerf: { x: 33, y: 523 },
        },
        durability: {
            buff: { x: 350, y: 512 },
            nerf: { x: 348, y: 513 },
        },
        text: {
            buff:   { x: 68, y: 392 },
            nerf:   { x: 71, y: 394 },
            adjust: { x: 69, y: 392 },
        },
    } as Record<string, Partial<Record<Adjustment, { x: number, y: number }>>>,

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

export default async function renderWeapon(
    data: EntityRenderData,
    asset: string,
): Promise<Buffer> {
    const canvas = createCanvas(fullSize.width, fullSize.height);

    const components: Component[] = [];

    // illustration
    components.push({
        type:  'image',
        image: join('..', 'card', 'illustration', 'jpg', `${data.cardId}.jpg`),
        pos:   position.illustration,
        size:  illusSize,
        clip(ctx) {
            const { x, y, r } = illusShape;

            ctx.ellipse(x, y, r, r, 0, 0, 2 * Math.PI);
        },
    });

    components.push({
        type:  'image',
        image: join('weapon', 'illus-shadow.png'),
        pos:   position.illusShadow,
    });

    // background
    const backgroundPath = join('weapon', 'background');

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

    if (data.mechanics.includes('forge')) {
        components.push({
            type:  'image',
            image: join('flag', 'forge.png'),
            pos:   position.flag,
        });
    }

    if (data.rune != null) {
        components.push({
            type:  'image',
            image: join('flag', 'rune', 'base.png'),
            pos:   position.runeBase,
        });

        if (data.rune.length === 3) {
            components.push(...data.rune.map((r, i) => ({
                type:  'image' as const,
                image: join('flag', 'rune', `${r}-small.png`),
                pos:   position.rune.full[i][r],
            })));
        } else {
            components.push(...data.rune.map((r, i) => ({
                type:  'image' as const,
                image: join('flag', 'rune', `${r}.png`),
                pos:   position.rune.full[i][r],
            })));
        }
    }

    // elite
    if (data.elite) {
        components.push({
            type:  'image',
            image: join('weapon', 'elite.png'),
            pos:   position.elite,
        });
    }

    // cost
    const aCost = (data.adjustment ?? []).find(a => a.part === 'cost');

    const costType = (() => {
        if (data.format === 'battlegrounds') {
            return 'coin';
        } else if (data.format != null) {
            return 'mana';
        } else {
            if (data.costType === 'speed') {
                return 'mana';
            }

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
            image: join('weapon', 'name.png'),
            pos:   position.name,
        },
        {
            type:   'curve-text',
            text:   data.name ?? '',
            font:   '文鼎隶书',
            size:   35,
            pos:    position.nameText,
            middle: 0.5,
            curve:  nameCurve,
        },
    );

    // text
    const aText = (data.adjustment ?? []).find(a => a.part === 'text');

    if (aText?.status === 'nerf') {
        components.push({
            type:  'image',
            image: join('weapon', 'effect', 'text-nerf.png'),
            pos:   position.adjustment.text.nerf!,
        });
    } else if (aText?.status === 'buff') {
        components.push({
            type:  'image',
            image: join('weapon', 'effect', 'text-buff.png'),
            pos:   position.adjustment.text.buff!,
        });
    } else if (aText?.status === 'adjust') {
        components.push({
            type:  'image',
            image: join('weapon', 'effect', 'text-adjust.png'),
            pos:   position.adjustment.text.adjust!,
        });
    }

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
                image: join('weapon', 'watermark', `${data.set}.png`),
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
        underwear: { flip: false, width: 0.27, height: 0.26 },
        color:     '#FFFFFF',
    });

    // rarity
    if (data.rarity != null && data.rarity !== 'free') {
        components.push(
            {
                type:  'image',
                image: join('weapon', 'rarity.png'),
                pos:   position.rarityBase,
            },
            {
                type:  'image',
                image: join('weapon', 'rarity', `${data.rarity}.png`),
                pos:   position.rarity,
            },
        );
    }

    // stats
    const aAttack = (data.adjustment ?? []).find(a => a.part === 'attack');

    if (aAttack?.status === 'nerf') {
        components.push({
            type:  'image',
            image: join('weapon', 'effect', 'attack-nerf.png'),
            pos:   position.adjustment.attack.nerf!,
        });
    } else {
        if (aAttack?.status === 'buff') {
            components.push({
                type:  'image',
                image: join('weapon', 'effect', 'attack-buff.png'),
                pos:   position.adjustment.attack.buff!,
            });
        }

        components.push({
            type:  'image',
            image: join('weapon', 'attack.png'),
            pos:   position.attack,
        });
    }

    if (data.attack != null) {
        components.push({
            type: 'text',
            text: data.attack!.toString(),
            font: '文鼎隶书',
            size: 106,
            pos:  position.attackNumber,
        });
    }

    const aDurability = (data.adjustment ?? []).find(a => a.part === 'durability');

    if (aDurability?.status === 'nerf') {
        components.push({
            type:  'image',
            image: join('weapon', 'effect', 'durability-nerf.png'),
            pos:   position.adjustment.durability.nerf!,
        });
    } else {
        components.push({
            type:  'image',
            image: join('weapon', 'durability.png'),
            pos:   position.durability,
        });

        if (aDurability?.status === 'buff') {
            components.push({
                type:  'image',
                image: join('weapon', 'effect', 'durability-buff.png'),
                pos:   position.adjustment.durability.buff!,
            });
        }
    }

    components.push({
        type: 'text',
        text: data.durability!.toString(),
        font: '文鼎隶书',
        size: 106,
        pos:  position.durabilityNumber,
    });

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
