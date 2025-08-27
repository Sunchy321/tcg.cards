import { Game } from '../index';

export interface Card {
    game:   Game;
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
