export interface PlayRequirement {
    type: string;
    param: number;
}

export interface Power {
    definition: string;
    playRequirements: PlayRequirement[];
}

export interface Entity {
    versions: number[];

    cardId: string;
    dbfId: number;
    slug?: string;

    set: string;

    localization: {
        lang: string;
        name: string;
        text: string;
        rawText: string;
        targetText: string;
        howToEarn: string;
        howToEarnGolden: string;
        flavor: string;
        illusId?: string;
    }[];

    classes: string[];
    cardType: string;
    cost: number;
    attack?: number;
    health?: number;
    durability?: number;
    armor?: number;
    race?: string;
    spellSchool?: string;
    quest?: { type: 'normal' | 'questline' | 'side', progress: number, part?: number };

    techLevel?: number;
    inBobsTavern: boolean;
    tripleCard?: string;
    raceBucket?: string;
    coin?: number;
    armorBucket?: number;
    buddy?: string;
    bannedRace?: string;

    mercenaryRole?: string;
    colddown?: number;

    collectible: boolean;
    elite: boolean;
    rarity: string;

    artist: string;

    faction?: string;

    mechanics: string[];
    referencedTags: string[];

    powers: Power[];

    relatedEntities: { relation: string, cardId: string }[];

    entourages: string[];
    heroPower?: string;
    heroicHeroPower?: string;
    parentCard?: string;
    childrenCard?: string[];

    multipleClasses: number;
    deckOrder: number;
    overrideWatermark: string;
    deckSize?: number;
}
