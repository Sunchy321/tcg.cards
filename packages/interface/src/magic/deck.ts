export type DeckVisibility = 'public' | 'unlisted' | 'private';

export type DeckCardCategory = 'main' | 'sideboard' | 'commander' | 'companion';

export interface DeckCard {
    cardId:   string;
    quantity: number;
    category: DeckCardCategory;
    version?: {
        set:    string;
        number: string;
        lang?:  string;
    };
}

export interface Deck {
    deckId:       string;
    userId:       string;
    name:         string;
    description?: string;
    format:       string;

    cards: DeckCard[];

    visibility: DeckVisibility;
    tags:       string[];

    createdAt: Date;
    updatedAt: Date;

    views:     number;
    likes:     number;
    favorites: number;
}

export interface DeckListItem {
    deckId:     string;
    userId:     string;
    name:       string;
    format:     string;
    visibility: DeckVisibility;
    tags:       string[];
    createdAt:  Date;
    updatedAt:  Date;
    views:      number;
    likes:      number;
    favorites:  number;
}
