import { join } from 'path';

import { asset } from '@config';

export function imageBasePath(
    type: string,
    set: string,
    lang: string,
): string {
    return join(asset, 'magic', 'card', type, set, lang);
}

export function imagePath(
    type: string,
    set: string,
    lang: string,
    number: string,
    part?: number,
): string {
    const ext = type === 'png' ? 'png' : 'jpg';

    const baseUrl = imageBasePath(type, set, lang);

    if (part != null) {
        return join(baseUrl, `${number}-${part}.${ext}`);
    } else {
        return join(baseUrl, `${number}.${ext}`);
    }
}
