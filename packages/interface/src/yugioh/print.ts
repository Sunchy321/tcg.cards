export type Layout = string;

export type Print = {
    cardId: string;

    lang:   string;
    set:    string;
    number: string;

    name:      string;
    rubyName?: string;
    typeline:  string;
    text:      string;
    comment?:  string;

    layout:      Layout;
    passcode?:   number;
    rarity:      string;
    releaseDate: string;

    tags: string[];
};
