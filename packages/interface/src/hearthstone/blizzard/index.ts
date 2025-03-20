export type Locale = 'de_DE' | 'en_GB' | 'en_US' | 'es_ES' | 'es_MX' | 'fr_FR' | 'it_IT' | 'ja_JP' | 'ko_KR' | 'pl_PL' | 'pt_BR' | 'ru_RU' | 'th_TH' | 'zh_CN' | 'zh_TW';

export type LocaleMap<T> = Record<Locale, T>;

export interface ISet {
    id:                          number;
    name:                        LocaleMap<string>;
    slug:                        string;
    releastDate:                 string | null;
    type:                        string;
    collectibleCount:            number;
    collectibleRevealedCount:    number;
    nonCollectibleCount:         number;
    nonCollectibleRevealedCount: number;
}

export interface ISetGroup {
    slug:      Exclude<string, 'standard' | 'wild'>;
    year:      number;
    cardSets:  string[];
    name:      LocaleMap<string>;
    standard:  boolean;
    yearRange: LocaleMap<string>;
    icon:      string;
}

export interface ISpecialSetGroup {
    slug:     'standard' | 'wild';
    cardSets: string[];
    name:     LocaleMap<string>;
}

export interface IType {
    slug: string;
    id:   number;
    name: LocaleMap<string>;
}

export interface IRarity {
    slug:         string;
    id:           number;
    craftingCost: [string | null, string | null];
    dustValue:    [string | null, string | null];
    name:         LocaleMap<string>;
}

export interface IClass {
    slug:   string;
    id:     number;
    name:   LocaleMap<string>;
    cardId: number;
}

export interface IMinionType {
    slug: string;
    id:   number;
    name: LocaleMap<string>;
}

export interface IGameMode {
    slug: string;
    id:   number;
    name: LocaleMap<string>;
}

export interface IKeyword {
    id:      number;
    slug:    string;
    name:    LocaleMap<string>;
    refText: LocaleMap<string>;
    text:    LocaleMap<string>;
}

export interface ICardBackCategory {
    slug: string;
    id:   number;
    name: LocaleMap<string>;
}

export interface IMetadata {
    sets:               ISet[];
    setGroups:          (ISetGroup | ISpecialSetGroup)[];
    arenaIds:           number[];
    types:              IType[];
    rarities:           IRarity[];
    classes:            IClass[];
    minionTypes:        IMinionType[];
    gameModes:          IGameMode[];
    keywords:           IKeyword[];
    filterableFields:   string[];
    numericFields:      string[];
    cardBackCategories: ICardBackCategory[];
}

export interface ICard {
    id:            number;
    collectible:   0 | 1;
    slug:          string;
    classId:       number;
    multiClassIds: number[];
    cardTypeId:    number;
    cardSetId:     number;
    rarityId:      number | null;
    artistName:    string | null;
    health?:       number;
    attack?:       number;
    manaCost:      number;
    durability?:   number;
    name:          LocaleMap<string>;
    text:          LocaleMap<string>;
    image:         LocaleMap<string>;
    imageGold:     LocaleMap<string>;
    flavorText:    LocaleMap<string>;
    cropImage:     string;
    parentId?:     number;
    childIds?:     number[];
    keywordIds?:   number[];
    duels?: {
        relevant:    true;
        constructed: true;
    };
    battlegrounds?: {
        tier?:      number;
        hero:       boolean;
        upgradeId?: number;
        image:      LocaleMap<string>;
        imageGold:  LocaleMap<string>;
    };
}
