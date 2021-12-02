export type CardType =
    'advertisement' | 'art' | 'auxiliary' | 'decklist' | 'minigame' | 'normal' | 'player' | 'token';

export interface Card {
    cardId: string;

    lang: string;
    set: string;
    number: string;

    manaValue: number;
    colorIdentity: string;

    parts: {
        cost?: string[];
        __costMap?: Record<string, number>;
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
            text?: string;
            typeline: string;
        };

        unified: {
            name: string;
            text?: string;
            typeline: string;
        };

        printed: {
            name: string;
            text?: string;
            typeline: string;
        };

        scryfallIllusId?: string;
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
    }[];

    keywords: string[];
    producedMana?: string;

    cardType: CardType;
    layout: string;
    frame: string;
    frameEffects: string[];
    borderColor: string;
    cardBack: string;
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

    legalities: Record<string, string>;
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
    };

    arenaId?: number;
    mtgoId?: number;
    mtgoFoilId?: number;
    multiverseId: number[];
    tcgPlayerId?: number;
    cardMarketId?: number;

    __tags: {
        oracleUpdated: boolean;
        printed?: boolean;
    };
}
