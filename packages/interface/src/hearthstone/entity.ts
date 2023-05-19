export interface PlayRequirement {
    type: string;
    param: number;
}

export interface Power {
    definition: string;
    isMaster?: boolean;
    showInHistory?: boolean;
    playRequirements: PlayRequirement[];
}

export interface Entity {
    version: number[];

    cardId: string;
    dbfId: number;
    slug?: string;

    localization: {
        lang: string;
        name: string;
        text: string;
        displayText: string;
        rawText: string;
        targetText?: string;
        textInPlay?: string;
        howToEarn?: string;
        howToEarnGolden?: string;
        flavor: string;
        illusId?: string;
    }[];

    set: string;
    classes: string[];
    cardType: string;
    cost: number;
    attack?: number;
    health?: number;
    durability?: number;
    armor?: number;
    rune?: string[];
    race?: string[];
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
    mercenaryFaction?: string;
    colddown?: number;

    collectible: boolean;
    elite: boolean;
    rarity?: string;

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
    localizationNotes?: string;
}
