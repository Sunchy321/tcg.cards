export type Legality = 'banned' | 'legal' | 'unavailable';

export type Banlist = Record<string, Legality>;

export interface FormatAnnouncement {
    source:         string;
    date:           string;
    effectiveDate?: string;
    link?:          string[];

    changes: {
        format:   string;
        setIn?:   string[];
        setOut?:  string[];
        banlist?: { id: string, status: Legality }[];
    }[];
}

export interface FormatChange {
    source: string;
    date:   string;
    format: string;
    link?:  string[];
    type:   'card' | 'set';
    id:     string;
    status: Legality | 'in' | 'out';
    group?: string;
}
