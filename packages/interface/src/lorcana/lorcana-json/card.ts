export interface Ability {
    fullText:            string;
    type:                'activated' | 'keyword' | 'static' | 'triggered';
    keyword?:            string;
    keywordValue?:       string;
    keywordValueNumber?: number;
    reminderText?:       string;
    effect?:             string;
    name?:               string;
    costs?:              string[];
    costsText?:          string;
}

export interface CardImages {
    full:      string;
    thumbnail: string;
    foilMask?: string;
}

export interface ExternalLinks {
    cardTraderId?:  number;
    cardTraderUrl?: string;
    cardmarketId?:  number;
    cardmarketUrl?: string;
    tcgPlayerId?:   number;
    tcgPlayerUrl?:  string;
}

export interface HistoricData {
    usedUntil:     string; // yyyy-mm-dd format
    [key: string]: any; // other changed fields
}

export interface Card {
    abilities?:        Ability[];
    artists:           string[];
    artistsText:       string;
    clarifications?:   string[];
    code:              string;
    color:             string;
    colors?:           string[];
    cost:              number;
    effects?:          string[];
    enchantedId?:      number;
    errata?:           string[];
    externalLinks:     ExternalLinks;
    flavorText?:       string;
    foilTypes?:        string[];
    fullIdentifier:    string;
    fullName:          string;
    fullText:          string;
    fullTextSections:  string[];
    historicData?:     HistoricData[];
    id:                number;
    images:            CardImages;
    inkwell:           boolean;
    isExternalReveal?: boolean;
    keywordAbilities?: string[];
    lore?:             number;
    moveCost?:         number;
    name:              string;
    nonEnchantedId?:   number;
    nonPromoId?:       number;
    number:            number;
    promoGrouping?:    string;
    promoIds?:         number[];
    rarity:            string;
    setCode?:          string;
    simpleName:        string;
    story:             string;
    strength?:         number;
    subtypes?:         string[];
    type:              string;
    variant?:          string;
    variantIds?:       number[];
    version?:          string;
    willpower?:        number;
}
