/* eslint-disable camelcase */

export type Locale = 'de_DE' |'en_US' |'es_ES' |'es_MX' |'fr_FR' |'it_IT' |'ja_JP' |'pt_BR' |'en_GB' |'pl_PL' |'ru_RU' |'ko_KR' |'zh_TW' |'zh_CN' |'th_TH';

export type LocaleMap<T> = {
    [k in Locale]: T
}

export interface ISet {
    id: number;
    name: LocaleMap<string>;
    slug: string;
    releastDate: string | null;
    type: string;
    collectibleCount: number;
    collectibleRevealedCount: number;
    nonCollectibleCount: number;
    nonCollectibleRevealedCount: number;
}

export interface ISetGroup {
    slug: Exclude<string, 'standard' | 'wild'>;
    year: number;
    cardSets: string[];
    name: LocaleMap<string>;
    standard: boolean;
    yearRange: LocaleMap<string>;
    icon: string;
}

export interface ISpecialSetGroup {
    slug: 'standard' | 'wild';
    cardSets: string[];
    name: LocaleMap<string>;
}

export interface IType {
    slug: string;
    id: number;
    name: LocaleMap<string>;
}

export interface IRarity {
    slug: string;
    id: number;
    craftingCost: [string | null, string | null];
    dustValue: [string | null, string | null];
    name: LocaleMap<string>;
}

export interface IClass {
    slug: string;
    id: number;
    name: LocaleMap<string>;
    cardId: number;
}

export interface IMinionType {
    slug: string;
    id: number;
    name: LocaleMap<string>;
}

export interface IGameMode {
    slug: string;
    id: number;
    name: LocaleMap<string>;
}

export interface IKeyword {
    id: number;
    slug: string;
    name: LocaleMap<string>;
    refText: LocaleMap<string>;
    text: LocaleMap<string>;
}

export interface ICardBackCategory {
    slug: string;
    id: number;
    name: LocaleMap<string>;
}

export interface IMetadata {
    sets: ISet[];
    setGroups: (ISetGroup | ISpecialSetGroup)[];
    arenaIds: number[];
    types: IType[];
    rarities: IRarity[];
    classes: IClass[];
    minionTypes: IMinionType[];
    gameModes: IGameMode[];
    keywords: IKeyword[];
    filterableFields: string[];
    numericFields: string[];
    cardBackCategories: ICardBackCategory[];
}
