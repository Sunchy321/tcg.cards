export type Layout = 'normal';

export type Print = {
    cardId: string;

    lang:   string;
    set:    string;
    number: string;

    name:     string;
    typeline: string;
    text:     string;

    tags:   string[];
    rarity: string;

    layout: Layout;
};
