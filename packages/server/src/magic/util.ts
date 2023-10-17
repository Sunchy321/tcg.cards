import { deburr } from 'lodash';
import {
    Colors, Legalities as SLegalities, Legality as SLegality, Manas,
} from '@interface/magic/scryfall/basic';
import { Legalities } from '@interface/magic/card';
import { Legality } from '@interface/magic/format-change';

export function toIdentifier(text: string): string {
    return deburr(text)
        .trim()
        .toLowerCase()
        .replace(' // ', '____')
        .replace('/', '____')
        .replace(/[^a-z0-9]/g, '_');
}

type Type = {
    typeSuper?: string[];
    typeMain: string[];
    typeSub?: string[];
};

const superList = [
    // formal supertype
    'basic',
    'legendary',
    'ongoing',
    'snow',
    'world',

    'token',

    // informal supertype
    'elite',
    'host',

    // only on Trial and Error
    'elemental',
];

const typeMainMap: Record<string, string> = {
    eaturecray: 'creature',
};

export function parseTypeline(typeline: string): Type {
    const [main, sub] = typeline.split('—').map(s => s.trim());

    const mainWord = main
        .toLowerCase()
        .split(' ')
        .map(w => typeMainMap[w] || w)
        .filter(w => w !== '');

    const typeSub = sub != null
        ? mainWord.includes('plane')
            ? [toIdentifier(sub)]
            : sub.split(/ |(time lord)/i).filter(v => v != null && v !== '').map(toIdentifier)
        : undefined;

    const typeSuper = mainWord.filter(w => superList.includes(w));
    const typeMain = mainWord.filter(w => !superList.includes(w));

    return {
        typeSuper: typeSuper.length > 0 ? typeSuper : undefined,
        typeMain,
        typeSub,
    };
}

export function convertColor(color: Colors): string {
    return color
        .sort((a, b) => ['W', 'U', 'B', 'R', 'G'].indexOf(a) - ['W', 'U', 'B', 'R', 'G'].indexOf(b))
        .join('');
}

export function convertMana(mana: Manas): string {
    return mana
        .sort((a, b) => ['W', 'U', 'B', 'R', 'G', 'C'].indexOf(a) - ['W', 'U', 'B', 'R', 'G', 'C'].indexOf(b))
        .join('');
}

export function convertLegality(legalities: SLegalities): Legalities {
    return Object.fromEntries(
        Object.entries(legalities).map(([k, v]) => [
            {
                duel:            'duelcommander',
                paupercommander: 'pauper_commander',
                historicbrawl:   'historic_brawl',
            }[k] ?? k,
            {
                duel: {
                    restricted: 'banned_as_commander',
                } as Record<SLegality, Legality>,
                paupercommander: {
                    restricted: 'legal',
                } as Record<SLegality, Legality>,
            }[k]?.[v] ?? (v === 'not_legal' ? 'unavailable' : v),
        ]),
    );
}

export function force<T>(value: T): T {
    return value;
}
