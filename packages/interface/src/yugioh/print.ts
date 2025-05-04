export type Layout = string;

export type Print = {
    cardId: string;

    lang:   string;
    set:    string;
    number: string;

    name:     string;
    typeline: string;
    text:     string;

    passcode?: number;
    rarity:    string;

    layout: Layout;

    tags: string[];
};
