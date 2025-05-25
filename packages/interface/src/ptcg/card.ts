export type Card = {
    cardId: string;

    name: string;
    text: string;

    localization: {
        lang:       string;
        __lastDate: string;
        name:       string;
        text:       string;
    }[];

    type: {
        main: string;
        sub:  string;
    };

    hp?:    number;
    stage?: string;
    types?: string[];

    abilities?: {
        name:   string;
        effect: string;
    }[];

    attacks?: {
        cost:    string[];
        name:    string;
        damage?: {
            amount: number;
            suffix: string;
        };
        effect: string;
    }[];

    rule?: string;

    weakness?: {
        type:  string[];
        value: string;
    };

    resistance?: {
        type:  string[];
        value: string;
    };

    retreat?: number;

    tags: string[];
};
