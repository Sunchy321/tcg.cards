export interface Card {
    game:   string;
    cardId: string;

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
