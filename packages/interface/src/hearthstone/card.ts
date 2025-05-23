import { Legality } from './format-change';

export type Change = 'major' | 'minor' | 'wording' | 'bugged' | 'unknown';

export type Legalities = Record<string, Legality>;

export interface Card {
    cardId: string;

    changes: {
        version: number[];
        change:  Change;
    }[];

    legalities: Legalities;
}
