import { Legality } from './format-change';

export type Change = 'major' | 'minor' | 'significant' | 'unspecified';

export interface Card {
    cardId: string;

    entityId: string[];

    legality: Record<string, Legality>;
}
