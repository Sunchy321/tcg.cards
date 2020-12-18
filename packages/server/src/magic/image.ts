import { join } from 'path';

import { asset } from '@config';

export function cardImageBase(
    type: string,
    set: string,
    lang: string,
): string {
    return join(asset, 'magic', 'card', type, set, lang);
}

export function cardImagePath(
    type: string,
    set: string,
    lang: string,
    number: string,
    part?: number,
): string {
    const ext = type === 'png' ? 'png' : 'jpg';

    const baseUrl = cardImageBase(type, set, lang);

    if (part != null) {
        return join(baseUrl, `${number}-${part}.${ext}`);
    } else {
        return join(baseUrl, `${number}.${ext}`);
    }
}

export const defaultIconPath = join(asset, 'magic', 'set', 'icon', 'default.svg');

export function setIconBase(set: string): string {
    return join(asset, 'magic', 'set', 'icon', set);
}

export function setIconPath(set: string, rarity: string, ext: string): string {
    return join(setIconBase(set), rarity + '.' + ext);
}
