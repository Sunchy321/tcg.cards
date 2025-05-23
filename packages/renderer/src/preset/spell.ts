import { createCanvas } from 'canvas';

import { EntityRenderData } from '../interface';
import { Adjustment } from '@interface/hearthstone/format-change';
import { Component, RichTextComponent, renderComponent } from '../components';

import { join } from 'path';

import { materialPath } from '../index';
import spellSchoolMap from '../localization/spell-school';

const fullSize = { width: 490, height: 660 };
const illusSize = { width: 310, height: 310 };

const illusShape = {
    cx: 246,
    cy: [190, 275],
    rx: 180,
    ry: 77,
    x:  [100, 392],
};

const nameCurve = [{ x: 10, y: 78 }, { x: 170, y: 36 }, { x: 294, y: 36 }, { x: 450, y: 80 }];
const textShape = [{ x: 113, y: 437 }, { x: 372, y: 573 }] as RichTextComponent['shape'];

const position = {
    illustration: { x: 89, y: 79 },
    illusShadow:  { x: 96, y: 108 },
    background:   {
        full:  { x: 56, y: 83 },
        left:  { x: 56, y: 83 },
        right: { x: 246, y: 83 },
        split: { x: 228, y: 88 },
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
    elite:      { x: 139, y: 49 },
    rarityBase: { x: 198, y: 379 },
    rarity:     { x: 230, y: 390 },
    name:       { x: 60, y: 317 },
    nameText:   { x: 246, y: 362 },
    desc:       { x: 80, y: 390 },
    school:     { x: 80, y: 540 },
    schoolText: { x: 247, y: 586 },

    adjustment: {
        mana: {
            buff: { x: 24, y: 24 },
            nerf: { x: 23, y: 45 },
        },
        coin: {
            buff: { x: 20, y: 46 },
            nerf: { x: 22, y: 47 },
        },
        text: {
            buff:   { x: 81, y: 376 },
            nerf:   { x: 98, y: 406 },
            adjust: { x: 97, y: 406 },
        },
        school: {
            adjust: { x: 144, y: 561 },
        },
    } as Record<string, Partial<Record<Adjustment, { x: number, y: number }>>>,

    watermark: {
        'classic': { x: 196, y: 446 },
        'hof':     { x: 183, y: 441 },
        'legacy':  { x: 196, y: 446 },
        'core21':  { x: 196, y: 457 },
        'core22':  { x: 196, y: 450 },

        'naxx':     { x: 183, y: 450 },
        'gvg':      { x: 188, y: 446 },
        'brm':      { x: 175, y: 455 },
        'tgt':      { x: 195, y: 451 },
        'loe':      { x: 184, y: 465 },
        'wog':      { x: 199, y: 451 },
        'onk':      { x: 209, y: 451 },
        'msg':      { x: 178, y: 447 },
        'jug':      { x: 197, y: 449 },
        'kft':      { x: 206, y: 444 },
        'knc':      { x: 211, y: 447 },
        'tww':      { x: 181, y: 449 },
        'tbp':      { x: 183, y: 450 },
        'rkr':      { x: 176, y: 450 },
        'ros':      { x: 181, y: 439 },
        'sou':      { x: 182, y: 451 },
        'dod':      { x: 177, y: 446 },
        'gra':      { x: 178, y: 450 },
        'aoo':      { x: 202, y: 455 },
        'dhi':      { x: 188, y: 450 },
        'sma':      { x: 174, y: 456 },
        'mdf':      { x: 192, y: 451 },
        'mdf-mini': { x: 182, y: 444 },
        'fib':      { x: 202, y: 450 },
        'fib-mini': { x: 187, y: 451 },
        'uis':      { x: 200, y: 452 },
        'uis-mini': { x: 190, y: 452 },
        'fav':      { x: 206, y: 447 },
        'fav-mini': { x: 191, y: 452 },
        'vsc':      { x: 199, y: 452 },
        'vsc-mini': { x: 191, y: 452 },
        'mcn':      { x: 199, y: 453 },

        'van': { x: 174, y: 456 },
    } as Record<string, { x: number, y: number }>,
};

export default async function renderSpell(
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
            const {
                cx, cy, rx, ry, x,
            } = illusShape;

            const y0 = cy[0] - Math.sqrt(ry * ry * (1 - ((cx - x[0]) * (cx - x[0])) / (rx * rx)));
            const y1 = cy[1] + Math.sqrt(ry * ry * (1 - ((cx - x[0]) * (cx - x[0])) / (rx * rx)));

            ctx.beginPath();

            ctx.moveTo(x[0], y0);
            ctx.ellipse(cx, cy[0], rx, ry, 0, Math.atan2(y0 - cy[0], x[0] - cx), Math.atan2(y0 - cy[0], x[1] - cx));
            ctx.lineTo(x[1], y1);
            ctx.ellipse(cx, cy[1], rx, ry, 0, Math.atan2(y1 - cy[1], x[1] - cx), Math.atan2(y1 - cy[1], x[0] - cx));
            ctx.lineTo(x[0], y0);

            ctx.closePath();
        },
    });

    components.push({
        type:  'image',
        image: join('spell', 'illus-shadow.png'),
        pos:   position.illusShadow,
    });

    // background
    const backgroundPath = join('spell', 'background');

    if (data.type === 'anomaly') {
        components.push({
            type:  'image',
            image: join(backgroundPath, 'anomaly.png'),
            pos:   position.background.full,
        });
    } else {
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
            image: join('spell', 'elite.png'),
            pos:   position.elite,
        });
    }

    // cost
    if (data.type !== 'anomaly') {
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
    }

    // name
    components.push(
        {
            type:  'image',
            image: join('spell', 'name.png'),
            pos:   position.name,
        },
        {
            type:   'curve-text',
            text:   data.name ?? '',
            font:   '文鼎隶书',
            size:   35,
            pos:    position.nameText,
            middle: 0.49,
            curve:  nameCurve,
        },
    );

    // text
    const aText = (data.adjustment ?? []).find(a => a.part === 'text');

    const textPrefix = data.spellSchool != null ? 'text-school' : 'text';

    if (aText?.status === 'nerf') {
        if (data.spellSchool != null) {
            components.push({
                type:  'image',
                image: join('spell', 'school.png'),
                pos:   position.school,
            });
        }

        components.push({
            type:  'image',
            image: join('spell', 'effect', `${textPrefix}-nerf.png`),
            pos:   position.adjustment.text.nerf!,
        });
    } else {
        components.push({
            type:  'image',
            image: join('spell', 'text.png'),
            pos:   position.desc,
        });

        if (data.spellSchool != null) {
            components.push({
                type:  'image',
                image: join('spell', 'school.png'),
                pos:   position.school,
            });
        }

        if (aText?.status === 'buff') {
            components.push({
                type:  'image',
                image: join('spell', 'effect', `${textPrefix}-buff.png`),
                pos:   position.adjustment.text.buff!,
            });
        } else if (aText?.status === 'adjust') {
            components.push({
                type:  'image',
                image: join('spell', 'effect', `${textPrefix}-adjust.png`),
                pos:   position.adjustment.text.adjust!,
            });
        }
    }

    // spell school
    const aSchool = (data.adjustment ?? []).find(a => a.part === 'school');

    if (aSchool?.status === 'adjust') {
        components.push({
            type:  'image',
            image: join('spell', 'effect', 'school-adjust.png'),
            pos:   position.adjustment.school.adjust!,
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
                image: join('spell', 'watermark', `${data.set}.png`),
                pos:   {
                    x: position.watermark[data.set].x,
                    y: position.watermark[data.set].y - (data.spellSchool != null ? 10 : 0),
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
        underwear: { flip: true, width: 0.26, height: 0.16 },
        color:     '#1E1710',
    });

    // rarity
    if (data.rarity != null && data.rarity !== 'free') {
        components.push(
            {
                type:  'image',
                image: join('spell', 'rarity.png'),
                pos:   position.rarityBase,
            },
            {
                type:  'image',
                image: join('spell', 'rarity', `${data.rarity}.png`),
                pos:   position.rarity,
            },
        );
    }

    // spell school
    if (data.spellSchool != null) {
        const school = spellSchoolMap[data.spellSchool];

        const schoolText = school?.[data.lang] ?? school?.en ?? data.spellSchool;

        components.push(
            {
                type: 'text',
                text: schoolText,
                font: '文鼎隶书',
                size: 32,
                pos:  position.schoolText,
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
