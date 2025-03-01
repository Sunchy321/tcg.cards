import { join } from 'path';

import { assetPath } from '@/config';

export function cardImageBase(): string {
    return join(assetPath, 'hearthstone', 'card', 'image');
}

export function cardImagePath(
    cardId: string,
    lang: string,
    version: number,
    variant: string,
): string {
    const baseUrl = cardImageBase();

    return join(baseUrl, version.toString(), variant, `${cardId}.png`);
}

export const defaultIconPath = join(assetPath, 'magic', 'set', 'icon', 'default.svg');

export function setIconBase(set: string): string {
    return join(assetPath, 'magic', 'set', 'icon', set);
}

export function setIconPath(set: string, rarity: string, ext: string): string {
    return join(setIconBase(set), `${rarity}.${ext}`);
}
