import { createCanvas } from 'canvas';

import { EntityRenderData } from '../interface';
import { Component, RichTextComponent, renderComponent } from '../components';

import { join } from 'path';

import { materialPath } from '../index';

const fullSize = { width: 490, height: 660 };
const illusSize = { width: 176, height: 176 };

const textShape = [{ x: 113, y: 431 }, { x: 366, y: 551 }] as RichTextComponent['shape'];

const position = {
    illustration: { x: 157, y: 137 },
    illusShadow:  { x: 162, y: 141 },
    background:   { x: 55, y: 131 },
    cost:         { x: 113, y: 70 },
    costNumber:   { x: 242, y: 103 },
    nameText:     { x: 247, y: 353 },
    desc:         { x: 78, y: 381 },
};

export default async function renderHeroPower(
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
        image: join('hero-power', 'illus-shadow.png'),
        pos:   position.illusShadow,
    });

    // background
    components.push({
        type:  'image',
        image: join('hero-power', 'background-friend.png'),
        pos:   position.background,
    });

    // cost
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

    components.push({
        type:  'image',
        image: join('hero-power', `frame-${costType}.png`),
        pos:   position.cost,
    });

    if (data.cost != null) {
        components.push({
            type: 'text',
            text: data.cost.toString(),
            font: '文鼎隶书',
            size: 93,
            pos:  position.costNumber,
        });
    }

    // name
    components.push({
        type: 'text',
        text: data.name,
        font: '文鼎隶书',
        size: 32,
        pos:  position.nameText,
    });

    // text
    components.push({
        type:      'rich-text',
        text:      data.text,
        font:      'BlizzardGlobal',
        size:      31,
        minSize:   20,
        shape:     textShape,
        underwear: { flip: false, width: 0.25, height: 0.19 },
        color:     '#000000',
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
