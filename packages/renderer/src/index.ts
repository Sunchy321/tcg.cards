import { EntityRenderData } from './interface';

import { join } from 'path';

import { registerFont } from 'canvas';

import renderMinion from './preset/minion';
import renderSpell from './preset/spell';
import renderWeapon from './preset/weapon';
import renderHero from './preset/hero';
import renderHeroPower from './preset/hero-power';
import renderLocation from './preset/location';

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
    case 'spell':
    case 'anomaly':
        return renderSpell(data, asset);
    case 'weapon':
        return renderWeapon(data, asset);
    case 'hero':
        return renderHero(data, asset);
    case 'hero_power':
        return renderHeroPower(data, asset);
    case 'location':
        return renderLocation(data, asset);
    default:
        throw new Error('Unknown card type');
    }
}
