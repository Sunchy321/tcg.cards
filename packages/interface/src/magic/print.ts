export type Layout =
    'adventure' | 'aftermath' | 'augment' | 'battle' | 'class' | 'double_faced' | 'emblem' | 'flip_token_bottom' | 'flip_token_top' | 'flip' | 'host' | 'leveler' | 'meld' | 'modal_dfc' | 'multipart' | 'normal' | 'planar' | 'reversible_card' | 'saga' | 'scheme' | 'split_arena' | 'split' | 'token' | 'transform_token' | 'transform' | 'vanguard';

export type Print = {
    cardId: string;

    lang:   string;
    set:    string;
    number: string;

    parts: {
        name:     string;
        typeline: string;
        text:     string;

        attractionLights?: number[];

        scryfallIllusId?: string[];
        flavorName?:      string;
        flavorText?:      string;
        artist?:          string;
        watermark?:       string;
    }[];

    tags: string[];

    layout:         Layout;
    frame:          string;
    frameEffects:   string[];
    borderColor:    string;
    cardBack:       string;
    securityStamp?: string;
    promoTypes?:    string[];
    rarity:         string;
    releaseDate:    string;

    isDigital:       boolean;
    isPromo:         boolean;
    isReprint:       boolean;
    finishes:        string[];
    hasHighResImage: boolean;
    imageStatus:     string;

    inBooster: boolean;
    games:     string[];

    preview?: {
        date:   string;
        source: string;
        uri:    string;
    };

    scryfall: {
        oracleId:  string;
        cardId?:   string;
        face?:     'back' | 'bottom' | 'front' | 'top';
        imageUris: Record<string, string>[];
    };

    arenaId?:      number;
    mtgoId?:       number;
    mtgoFoilId?:   number;
    multiverseId:  number[];
    tcgPlayerId?:  number;
    cardMarketId?: number;
};
