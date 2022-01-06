import { deburr } from 'lodash';
import { Colors, Legalities as SLegalities } from '@interface/magic/scryfall/basic';
import { Legalities } from '@interface/magic/card';

export function toIdentifier(text: string): string {
    return deburr(text)
        .trim()
        .toLowerCase()
        .replace(' // ', '____')
        .replace('/', '____')
        .replace(/[^a-z0-9]/g, '_');
}

interface IType {
    typeSuper?: string[];
    typeMain: string[];
    typeSub?: string[];
}

const superList = [
    'autobot',
    'elemental',
    'elite',
    'hero',
    'legendary',
    'ongoing',
    'snow',
    'token',
    'world',
];

const typeMainMap: Record<string, string> = {
    eaturecray: 'creature',
};

export function parseTypeline(typeline: string): IType {
    const [main, sub] = typeline.split('—').map(s => s.trim());

    const mainWord = main
        .toLowerCase()
        .split(' ')
        .map(w => typeMainMap[w] || w)
        .filter(w => w !== '');

    const typeSub = sub != null
        ? mainWord.includes('plane')
            ? [toIdentifier(sub)]
            : sub.split(' ').map(toIdentifier)
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

export function convertLegality(legalities: SLegalities): Legalities {
    return Object.fromEntries(
        Object.entries(legalities).map(([k, v]) => [
            k === 'duel' ? 'duelcommander' : k,
            v === 'not_legal'
                ? 'unavailable' : k === 'duel' && v === 'restricted'
                    ? 'banned_as_commander' : v,
        ]),
    );
}
