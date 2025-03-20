import { Legality } from './format-change';

export type Category =
    'advertisement' | 'art' | 'auxiliary' | 'decklist' | 'default' | 'minigame' | 'player' | 'token';

export type Legalities = Record<string, Legality>;

export type Card = {
    cardId: string;

    manaValue:     number;
    colorIdentity: string;

    parts: {
        name:     string;
        typeline: string;
        text:     string;

        localization: {
            lang:     string;
            name:     string;
            typeline: string;
            text:     string;
        }[];

        cost?:           string[];
        manaValue?:      number;
        color?:          string;
        colorIndicator?: string;

        type: {
            super?: string[];
            main:   string[];
            sub?:   string[];
        };

        power?:        string;
        toughness?:    string;
        loyalty?:      string;
        defense?:      string;
        handModifier?: string;
        lifeModifier?: string;
    }[];

    keywords:        string[];
    counters?:       string[];
    producibleMana?: string;
    tags:            string[];

    category:        Category;
    legalities:      Legalities;
    contentWarning?: boolean;

    scryfall: {
        oracleId: string[];
    };
};
