import { Legality } from './format-change';

export type Category = 'normal';

export type Legalities = Record<string, Legality>;

export type Card = {
    cardId: string;

    localization: {
        lang:      string;
        name:      string;
        rubyName?: string;
        typeline:  string;
        text:      string;
        comment?:  string;
    }[];

    type: {
        main: string;
        sub?: string[];
    };

    attribute?:   string;
    level?:       number;
    rank?:        number;
    linkValue?:   number;
    linkMarkers?: string[];
    attack?:      number | string;
    defense?:     number | string;
    race?:        string;

    pendulumScale?:  {
        left:  number;
        right: number;
    };

    tags: string[];

    category:   Category;
    legalities: Legalities;

    konamiId?: number;
    passcode?: number;
};
