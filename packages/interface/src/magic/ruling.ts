export type Ruling = {
    cardId: string;
    source: string;
    date:   string;
    text:   string;

    cards: {
        text:   string;
        cardId: string;
        part?:  number;
    }[];
};
