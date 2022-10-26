export type Legality = 'banned' | 'legal' | 'unavailable';
export type Adjustment = 'adjust' | 'buff' | 'nerf';

export type Banlist = Record<string, Legality>;

export interface FormatAnnouncement {
    source: string;
    date: string;
    effectiveDate?: string;
    link?: string[];
    version: number;
    lastVersion?: number;

    changes: {
        format: string;
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
    type: 'card' | 'set';
    id: string;
    status: Adjustment | Legality | 'in' | 'out';
    adjustment: {
        id: string;
        detail: { part: string, status: Adjustment }[];
        from: number;
        to: number;
    }[];
}
