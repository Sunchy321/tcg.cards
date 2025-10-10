import {
    Colors, Legalities as SLegalities, Legality as SLegality, Manas,
} from '@model/magic/schema/data/scryfall/basic';

import { Legality, Legalities } from '@model/magic/schema/game-change';

import { escapeRegExp } from 'lodash';
import { toIdentifier } from '@common/util/id';

type Type = {
    typeSuper: string[] | null;
    typeMain:  string[];
    typeSub:   string[] | null;
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
        : null;

    const typeSuper = mainWord.filter(w => superList.includes(w));
    const typeMain = mainWord.filter(w => !superList.includes(w));

    return {
        typeSuper: typeSuper.length > 0 ? typeSuper : null,
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
                standardbrawl:   'standard_brawl',
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

export function intoRichText(text: string, cards: { text: string, cardId: string, part?: number }[]) {
    if (cards.length === 0) {
        return text;
    }

    const regex = new RegExp(cards.map(c => escapeRegExp(c.text)).join('|'), 'g');

    return text.replace(regex, text => {
        if (text == '') {
            return '';
        }

        const match = cards.find(c => c.text == text);

        if (match == null) {
            throw new Error(`Card text "${text}" not found in cards list.`);
        }

        const cardInfo = match.part != null ? `${match.cardId}/${match.part}` : match.cardId;

        return `@card(${cardInfo}){${match.text}}`;
    });
}
