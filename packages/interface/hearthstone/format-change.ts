export type Legality = 'banned' | 'legal' | 'unavailable';
export type Adjust = 'adjust' | 'buff' | 'nerf';

export type Banlist = Record<string, Legality>;

export interface EntityEssential {
    cardId: string;

    localization: {
        lang: string;
        name: string;
        text: string;
        displayText: string;
        rawText: string;
    }[];

    set: string;
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
    raceBucket?: string;
    armorBucket?: number;
    buddy?: string;
    bannedRace?: string;

    mercenaryRole?: string;
    colddown?: number;

    collectible: boolean;
    elite: boolean;
    rarity?: string;

    mechanics: string[];
    referencedTags: string[];

    heroPower?: string;
}

export interface FormatAnnouncement {
    source: string;
    date: string;
    effectiveDate?: string;
    link?: string[];

    changes: {
        format: string;
        setIn?: string[];
        setOut?: string[];
        banlist?: { id: string, status: Legality }[];
        adjust?: {
            status: Adjust;
            detail: { part: string, status: Adjust }[];
            from: EntityEssential;
            to: EntityEssential;
            related?: EntityEssential[];
        }[];
    }[];
}

export interface FormatChange {
    source: string;
    date: string;
    format: string;
    link?: string[];
    type: 'card' | 'set';
    id: string;
    status: Adjust | Legality | 'in' | 'out';
    entity?: EntityEssential;
    adjust: {
        from?: EntityEssential;
        to?: EntityEssential;
    }[];
}
