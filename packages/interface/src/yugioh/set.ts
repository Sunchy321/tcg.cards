export interface SetLocalization {
    lang:            string;
    name?:           string;
    isOfficialName?: boolean;
}

export interface Set {
    setId: string;

    cardCount: number;
    langs:     string[];
    rarities:  string[];

    localization: SetLocalization[];

    type: string;

    releaseDate: string;
}
