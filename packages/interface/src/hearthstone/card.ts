import { Legality } from './format-change';

export type Change = 'major' | 'minor' | 'wording' | 'bugged' | 'unknown';

export interface Card {
    cardId: string;

    changes: {
        version: number[];
        change:  Change;
    }[];

    legality: Record<string, Legality>;
}
