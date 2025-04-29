export type Layout = string;

export type Print = {
    cardId: number;

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
