export interface SetLocalization {
    lang: string;
    name?: string;
}

export interface Set {
    setId: string;
    dbfId?: number;
    slug?: string;

    localization: SetLocalization[];

    setType: string;

    releaseDate?: string;
    cardCount: [number, number];
    group?: string;
}
