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

export type Change = 'major' | 'minor' | 'significant' | 'unspecified';

export interface Card {
    cardId: string;

    version: number[];
    change?: Change;

    entityId: string[];

    localization: {
        lang: string;
        name: string;
        text: string;
        displayText: string;
        targetText?: string;
        textInPlay?: string;
        flavor: string;
        illusId?: string;
    }[];

    set: string[];
    classes: string[];
    type: string;
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

    mechanics: string[];
    referencedTags: string[];

    relatedEntities: { relation: string, cardId: string }[];

    entourages: string[];
    heroPower?: string;
    heroicHeroPower?: string;

    deckOrder: number;
    overrideWatermark: string;
    deckSize?: number;
    localizationNotes?: string;
}
