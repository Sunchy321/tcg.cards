import { Legality } from './format-change';

export type Change = 'major' | 'minor' | 'significant' | 'unspecified';

export interface Card {
    cardId: string;

    change: Change;

    legality: Record<string, Legality>;
}
