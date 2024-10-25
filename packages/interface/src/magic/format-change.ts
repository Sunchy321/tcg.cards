export type Legality =
    'banned_as_commander' | 'banned_as_companion' | 'banned_in_bo1' | 'banned' | 'legal' | 'restricted' | 'suspended' | 'unavailable' | `score-${number}`;

export type Banlist = Record<string, Legality>;

export interface FormatAnnouncement {
    source: string;
    date: string;

    effectiveDate?: {
        tabletop?: string;
        online?: string;
        arena?: string;
    };

    nextDate?: string;

    link?: string[];

    changes: {
        format: string;
        setIn?: string[];
        setOut?: string[];
        banlist?: { id: string, status: Legality, effectiveDate?: string }[];
    }[];
}

export interface FormatChange {
    source: string;
    date: string;
    format: string;
    link?: string[];
    type: 'card' | 'set';
    id: string;
    status: Legality | 'in' | 'out';
    group?: string;
}
