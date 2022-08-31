import { EntityRenderData } from './interface';

import { join } from 'path';

import renderMinion from './preset/minion';
import { registerFont } from 'canvas';

export function materialPath(asset: string): string {
    return join(asset, 'hearthstone', 'material');
}

export function registerFonts(asset: string): void {
    registerFont(join(materialPath(asset), 'fonts', '文鼎隶书.ttf'), {
        family: '文鼎隶书',
    });

    registerFont(join(materialPath(asset), 'fonts', 'BlizzardGlobal-BoldItalic.ttf'), {
        family: 'BlizzardGlobal',
        weight: 'bold',
        style:  'italic',
    });

    registerFont(join(materialPath(asset), 'fonts', 'BlizzardGlobal-Italic.ttf'), {
        family: 'BlizzardGlobal',
        style:  'italic',
    });

    registerFont(join(materialPath(asset), 'fonts', 'BlizzardGlobal-Bold.ttf'), {
        family: 'BlizzardGlobal',
        weight: 'bold',
    });

    registerFont(join(materialPath(asset), 'fonts', 'BlizzardGlobal.ttf'), {
        family: 'BlizzardGlobal',
    });
}

export default async function renderEntity(
    data: EntityRenderData,
    asset: string,
): Promise<Buffer> {
    switch (data.cardType) {
    case 'minion':
        return renderMinion(data, asset);
    default:
        throw new Error('Unknown card type');
    }
}
