export interface SetLocalization {
    lang: string;
    name?: string;
    isOfficialName: boolean;
    link?: string;
}

export interface Set {
    setId: string;

    block?: string;
    parent?: string;

    printedSize?: number;
    cardCount: number;
    langs: string[];
    rarities: string[];

    localization: SetLocalization[];

    setType: string;
    isDigital: boolean;
    isFoilOnly: boolean;
    isNonfoilOnly: boolean;
    symbolStyle: string[];

    releaseDate?: string;

    scryfall: {
        id: string;
        code: string;
    };

    mtgoCode?: string;
    tcgplayerId?: number;

}
