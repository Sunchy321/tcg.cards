export type Ruling = {
    source: string;
    date: string;
    text: string;

    cards: {
        text: string;
        id: string;
        part?: number;
    }[];
};
