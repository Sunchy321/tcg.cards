export type BanlistStatus =
    'banned_as_commander' | 'banned_as_companion' | 'banned' | 'legal' | 'restricted' | 'suspended' | 'unavailable';

export type Banlist = Record<string, BanlistStatus>;

export interface BanlistChange {
    date: string;
    category: string;

    effectiveDate?: {
        tabletop?: string;
        online?: string;
        arena?: string;
    };

    nextDate?: string;

    link: string[];

    changes: {
        card: string;
        format: string;
        status?: BanlistStatus;
        effectiveDate?: string;
        detail?: {
            card: string;
            date?: string;
            status?: BanlistStatus;
            group?: string;
        }[];
    }[];
}
