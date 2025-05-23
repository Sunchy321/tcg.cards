export type Layout = 'normal';

export type Rarity = string;

export type Print = {
    cardId: string;

    lang:   string;
    set:    string;
    number: string;

    name: string;
    text: string;

    flavorText?: string;
    artist?:     string[];

    regulation?: string;

    layout:      Layout;
    rarity:      Rarity;
    releaseDate: string;

    tags: string[];
};
