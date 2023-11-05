import { createCanvas } from 'canvas';

import { EntityRenderData } from '../interface';
import { Adjustment } from '@interface/hearthstone/format-change';
import { Component, RichTextComponent, renderComponent } from '../components';

import { join } from 'path';

import { materialPath } from '../index';
import raceMap from '../localization/race';

const fullSize = { width: 490, height: 660 };
const illusSize = { width: 334, height: 334 };

const illusShape = {
    cx: 246, cy: 223, rx: 117, ry: 160,
};

const nameCurve = [{ x: 0, y: 88 }, { x: 98, y: 112 }, { x: 294, y: 13 }, { x: 460, y: 80 }];
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
    techLevel: {
        base: { x: 38, y: 58 },
        1:    { x: 78, y: 99 },
        2:    { x: 62, y: 100 },
        3:    { x: 62, y: 89 },
        4:    { x: 62, y: 83 },
        5:    { x: 59, y: 75 },
        6:    { x: 59, y: 75 },
        7:    { x: 59, y: 63 },
    } as Record<number | 'base', { x: number, y: number }>,
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
    elite:          { x: 139, y: 22 },
    rarityBase:     { x: 203, y: 375 },
    rarity:         { x: 237, y: 385 },
    name:           { x: 73, y: 323 },
    nameText:       { x: 248, y: 355 },
    desc:           { x: 83, y: 408 },
    race:           { x: 139, y: 568 },
    raceText:       { x: 247, y: 584 },
    dualRace:       { x: 112, y: 561 },
    dualRaceTop:    { x: 253, y: 582 },
    dualRaceBottom: { x: 253, y: 605 },
    attack:         { x: 29, y: 507 },
    attackNumber:   { x: 94, y: 575 },
    health:         { x: 369, y: 512 },
    healthNumber:   { x: 407, y: 577 },

    adjustment: {
        mana: {
            buff: { x: 24, y: 24 },
            nerf: { x: 23, y: 45 },
        },
        coin: {
            buff: { x: 20, y: 46 },
            nerf: { x: 22, y: 47 },
        },
        techLevel: {
            buff: { x: 24, y: 41 },
            nerf: { x: 25, y: 43 },
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
        'mcn-mini': { x: 194, y: 442 },
        'poa':      { x: 194, y: 445 },

        'ttn': { x: 187, y: 443 },

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
        image: join('..', 'card', 'illustration', 'jpg', `${data.cardId}.jpg`),
        pos:   position.illustration,
        size:  illusSize,
        clip(ctx) {
            const {
                cx, cy, rx, ry,
            } = illusShape;

            ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
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
            image: join('minion', 'elite.png'),
            pos:   position.elite,
        });
    }

    // cost
    if (data.format === 'battlegrounds') {
        const aTechLevel = (data.adjustment ?? []).find(a => a.part === 'techLevel');

        if (aTechLevel?.status === 'nerf') {
            components.push({
                type:  'image',
                image: join('cost', 'effect', 'tech-level-nerf.png'),
                pos:   position.adjustment.techLevel.nerf!,
            });
        } else {
            components.push({
                type:  'image',
                image: join('cost', 'tech-level', 'base.png'),
                pos:   position.techLevel.base,
            });

            if (aTechLevel?.status === 'buff') {
                components.push({
                    type:  'image',
                    image: join('cost', 'effect', 'tech-level-buff.png'),
                    pos:   position.adjustment.techLevel.buff!,
                });
            }
        }

        if (data.techLevel != null && data.techLevel >= 1 && data.techLevel <= 7) {
            components.push({
                type:  'image',
                image: join('cost', 'tech-level', `${data.techLevel}.png`),
                pos:   position.techLevel[data.techLevel],
            });
        }
    } else {
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
    const aText = (data.adjustment ?? []).find(a => a.part === 'text');

    if (aText?.status === 'nerf') {
        components.push({
            type:  'image',
            image: join('minion', 'effect', 'text-nerf.png'),
            pos:   position.adjustment.text.nerf!,
        });
    } else {
        components.push({
            type:  'image',
            image: join('minion', 'text.png'),
            pos:   position.desc,
        });

        if (aText?.status === 'buff') {
            components.push({
                type:  'image',
                image: join('minion', 'effect', 'text-buff.png'),
                pos:   position.adjustment.text.buff!,
            });
        } else if (aText?.status === 'adjust') {
            components.push({
                type:  'image',
                image: join('minion', 'effect', 'text-adjust.png'),
                pos:   position.adjustment.text.adjust!,
            });
        }
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
                image: join('minion', 'rarity.png'),
                pos:   position.rarityBase,
            },
            {
                type:  'image',
                image: join('minion', 'rarity', `${data.rarity}.png`),
                pos:   position.rarity,
            },
        );
    }

    // race
    if (data.race != null) {
        const raceText = data.race.map(r => {
            const race = raceMap[r];

            return race?.[data.lang] ?? race?.en ?? data.race;
        });

        if (data.race.length === 2) {
            components.push(
                {
                    type:  'image',
                    image: join('minion', 'dualrace.png'),
                    pos:   position.dualRace,
                },
                {
                    type: 'text',
                    text: raceText[0],
                    font: '文鼎隶书',
                    size: 28,
                    pos:  position.dualRaceTop,
                },
                {
                    type: 'text',
                    text: raceText[1],
                    font: '文鼎隶书',
                    size: 28,
                    pos:  position.dualRaceBottom,
                },
            );
        } else {
            components.push(
                {
                    type:  'image',
                    image: join('minion', 'race.png'),
                    pos:   position.race,
                },
                {
                    type: 'text',
                    text: raceText[0],
                    font: '文鼎隶书',
                    size: 32,
                    pos:  position.raceText,
                },
            );
        }
    }

    const aRace = (data.adjustment ?? []).find(a => a.part === 'race');

    if (aRace?.status === 'adjust') {
        components.push({
            type:  'image',
            image: join('minion', 'effect', 'race-adjust.png'),
            pos:   position.adjustment.race.adjust!,
        });
    }

    // stats
    const aAttack = (data.adjustment ?? []).find(a => a.part === 'attack');

    if (aAttack?.status === 'nerf') {
        components.push({
            type:  'image',
            image: join('minion', 'effect', 'attack-nerf.png'),
            pos:   position.adjustment.attack.nerf!,
        });
    } else {
        components.push({
            type:  'image',
            image: join('minion', 'attack.png'),
            pos:   position.attack,
        });

        if (aAttack?.status === 'buff') {
            components.push({
                type:  'image',
                image: join('minion', 'effect', 'attack-buff.png'),
                pos:   position.adjustment.attack.buff!,
            });
        }
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

    const aHealth = (data.adjustment ?? []).find(a => a.part === 'health');

    if (aHealth?.status === 'nerf') {
        components.push({
            type:  'image',
            image: join('minion', 'effect', 'health-nerf.png'),
            pos:   position.adjustment.health.nerf!,
        });
    } else {
        components.push({
            type:  'image',
            image: join('minion', 'health.png'),
            pos:   position.health,
        });

        if (aHealth?.status === 'buff') {
            components.push({
                type:  'image',
                image: join('minion', 'effect', 'health-buff.png'),
                pos:   position.adjustment.health.buff!,
            });
        }
    }

    if (data.health != null) {
        components.push({
            type: 'text',
            text: data.health!.toString(),
            font: '文鼎隶书',
            size: 106,
            pos:  position.healthNumber,
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
