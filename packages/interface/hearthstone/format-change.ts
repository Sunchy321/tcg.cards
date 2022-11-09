export type Legality = 'banned_in_card_pool' | 'banned_in_deck' | 'banned' | 'legal' | 'unavailable';
export type Adjustment = 'adjust' | 'buff' | 'nerf';

export type Banlist = Record<string, Legality>;

export interface FormatAnnouncement {
    source: string;
    date: string;
    effectiveDate?: string;
    name: string;
    link?: string[];
    version: number;
    lastVersion?: number;

    changes: {
        format: string;
        effectiveDate?: string;
        setIn?: string[];
        setOut?: string[];
        banlist?: { id: string, status: Legality }[];
        adjustment?: {
            id: string;
            status: Adjustment;
            detail: { part: string, status: Adjustment }[];
            related?: string[];
        }[];
    }[];
}

export interface FormatChange {
    source: string;
    date: string;
    format: string;
    link?: string[];
    version: number;
    lastVersion?: number;
    type: 'adjustment' | 'banlist' | 'set';
    id: string;
    status: Adjustment | Legality | 'in' | 'out';
    adjustment?: {
        id?: string;
        detail: { part: string, status: Adjustment }[];
    }[];
}
