import { Rarity } from './print';

export interface SetLocalization {
    lang:            string;
    name?:           string;
    isOfficialName?: boolean;
}

export interface Set {
    setId:  string;
    number: number;

    cardCount: number;
    langs:     string[];
    rarities:  Rarity[];

    localization: SetLocalization[];

    type: string;

    releaseDate:    string;
    prereleaseDate: string;

    lorcanaJsonId: string;
}
