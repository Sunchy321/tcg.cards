export interface Deck {
    format: string;

    cards: [{
        cardId:   string;
        version?: {
            set:    string;
            number: string;
            lang?:  string;
        };
    }];
}
