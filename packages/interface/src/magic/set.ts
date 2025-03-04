import { Deck } from './deck';

export interface SetLocalization {
    lang: string;
    name?: string;
    isOfficialName?: boolean;
    link?: string;
}

export interface Booster {
    boosterId: string;

    packs: {
        contents: {
            type: string;
            count: number;
        }[];

        weight: number;
    }[];

    totalWeight: number;

    sheets: {
        typeId: string;

        cards: {
            cardId: string;
            version: {
                set: string;
                number: string;
                lang?: string;
            };
            weight: number;
        }[];

        totalWeight: number;

        allowDuplicates: boolean;
        balanceColors: boolean;
        isFoil: boolean;
        isFixed: boolean;
    }[];
}

export interface Set {
    setId: string;

    block?: string;
    parent?: string;

    printedSize?: number;
    cardCount: number;
    langs: string[];
    rarities: string[];

    localization: SetLocalization[];

    type: string;
    isDigital: boolean;
    isFoilOnly: boolean;
    isNonfoilOnly: boolean;
    symbolStyle?: string[];
    doubleFacedIcon?: string[];

    releaseDate?: string;

    scryfall: {
        id: string;
        code: string;
    };

    mtgoCode?: string;
    tcgplayerId?: number;

    boosters?: Booster[];
    decks?: Deck[];
}
