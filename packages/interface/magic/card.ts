export type Category =
    'advertisement' | 'art' | 'auxiliary' | 'decklist' | 'default' | 'minigame' | 'player' | 'token';

export type Legality =
    'banned_as_commander' | 'banned_as_companion' | 'banned' | 'legal' | 'restricted' | 'suspended' | 'unavailable';

export type Legalities = Record<string, Legality>;

export type Layout =
    'adventure' | 'aftermath' | 'augment' | 'class' | 'emblem' | 'flip' | 'host' | 'leveler' | 'meld' | 'minigame' | 'modal_dfc' | 'multipart' | 'normal' | 'planar' | 'reversible_card' | 'saga' | 'scheme' | 'split_arena' | 'split' | 'token' | 'transform' | 'vanguard';

export type Card = {
    cardId: string;

    lang: string;
    set: string;
    number: string;

    manaValue: number;
    colorIdentity: string;

    parts: {
        cost?: string[];
        color?: string;
        colorIndicator?: string;

        typeSuper?: string[];
        typeMain: string[];
        typeSub?: string[];

        power?: string;
        toughness?: string;
        loyalty?: string;
        handModifier?: string;
        lifeModifier?: string;

        oracle: {
            name: string;
            typeline: string;
            text?: string;
        };

        unified: {
            name: string;
            typeline: string;
            text?: string;
        };

        printed: {
            name: string;
            typeline: string;
            text?: string;
        };

        scryfallIllusId?: string[];
        flavorName?: string;
        flavorText?: string;
        artist?: string;
        watermark?: string;
    }[];

    relatedCards: {
        relation: string;
        cardId: string;
        version?: {
            lang: string;
            set: string;
            number: string;
        };
    }[];

    rulings: {
        source: string;
        date: string;
        text: string;
        cards?: { id: string, text: string, part?: number }[];
    }[];

    keywords: string[];
    counters?: string[];
    producibleMana?: string;
    tags: string[];
    localTags: string[];

    category: Category;
    layout: Layout;
    frame: string;
    frameEffects: string[];
    borderColor: string;
    cardBack: string;
    securityStamp?: string;
    promoTypes?: string[];
    rarity: string;
    releaseDate: string;

    isDigital: boolean;
    isFullArt: boolean;
    isOversized: boolean;
    isPromo: boolean;
    isReprint: boolean;
    isStorySpotlight: boolean;
    isTextless: boolean;
    finishes: string[];
    hasHighResImage: boolean;
    imageStatus: string;

    legalities: Legalities;
    isReserved: boolean;
    inBooster: boolean;
    contentWarning?: boolean;
    games: string[];

    preview?: {
        date: string;
        source: string;
        uri: string;
    };

    scryfall: {
        oracleId: string;
        cardId?: string;
        face?: 'back' | 'front';
        imageUris: Record<string, string>[];
    };

    arenaId?: number;
    mtgoId?: number;
    mtgoFoilId?: number;
    multiverseId: number[];
    tcgPlayerId?: number;
    cardMarketId?: number;
};
