import { EntityRenderData } from './interface';

import { join } from 'path';

import renderMinion from './renderer/minion';
import { registerFont } from 'canvas';

export function materialPath(asset: string): string {
    return join(asset, 'hearthstone', 'material');
}

export function registerFonts(asset: string): void {
    registerFont(join(materialPath(asset), 'fonts', '文鼎隶书.ttf'), {
        family: '文鼎隶书',
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
