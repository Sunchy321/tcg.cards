import { Legality } from './format-change';

export type MainType = 'pokemon' | 'trainer' | 'energy';

export type SubType = 'basic' | 'special' | 'item' | 'supporter' | 'stadium' | 'technical_machine';

export type Category = 'normal';

export type Legalities = Record<string, Legality>;

export type Card = {
    cardId: string;

    name:        string;
    text:        string;
    evolveFrom?: string;

    localization: {
        lang:        string;
        __lastDate:  string;
        name:        string;
        text:        string;
        evolveFrom?: string;
    }[];

    type: {
        main: MainType;
        sub?: SubType;
    };

    hp?:    number;
    stage?: string;
    types?: string;
    level?: string;

    vstarPower?: {
        type:    string;
        cost?:   string;
        name:    string;
        damage?: string | {
            amount: number;
            suffix: string;
        } | null;
        effect: string;
    };

    abilities?: {
        name:   string;
        effect: string;
    }[];

    attacks?: {
        cost:    string;
        name:    string;
        damage?: string;
        effect:  string;
    }[];

    rule?: string;

    weakness?: {
        type:  string;
        value: string;
    };

    resistance?: {
        type:  string;
        value: string;
    };

    retreat?: number;

    pokedex?: {
        number?:   number;
        category?: string;
        height?:   string;
        weight?:   string;
    };

    category:   Category;
    tags:       string[];
    legalities: Legalities;
};
