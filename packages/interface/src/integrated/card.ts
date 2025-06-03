export interface Card {
    cardId: string;

    game: string;

    name:     string;
    typeline: string;
    text:     string;

    localization: {
        lang:     string;
        name:     string;
        typeline: string;
        text:     string;
    }[];
}
