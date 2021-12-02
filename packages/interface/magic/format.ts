export interface Format {
    formatId: string;
    localization: { lang: string, name: string }[];
    sets?: string[];
    banlist: { card: string, status: string, date: string, group?: string }[];
    birthday?: string;
    deathdate?: string;
}

export interface FormatChange {
    date: string;

    changes: {
        category: string;
        format?: string;
        in: string[];
        out: string[];
    }[];
}
