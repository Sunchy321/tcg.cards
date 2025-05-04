export interface BanlistInfo {
    ban_tcg:  string;
    ban_ocg:  string;
    ban_goat: string;
}

export interface CardSet {
    set_name:        string;
    set_code:        string;
    set_rarity:      string;
    set_rarity_code: string;
    set_price:       string;
}

export interface MiscInfo {
    beta_name?:  string;
    views:       number;
    viewsweek:   number;
    upvotes:     number;
    downvotes:   number;
    formats:     string[];
    treated_as?: string;
    beta_id:     number;
    tcg_date:    string;
    ocg_date:    string;
    konami_id:   number;
    has_effect:  number;
    md_rarity:   string;
}

export interface Card {
    id:                    number;
    name:                  string;
    type:                  string;
    humanReadableCardType: string;
    frameType:             string;
    desc:                  string;
    race:                  string;
    archetype?:            string;
    ygoprodeck_url:        string;
    card_sets?:            CardSet[];
    card_images:           object[];
    card_prices:           object[];
    misc_info:             MiscInfo[];
    typeline?:             string[];
    atk?:                  number;
    def?:                  number;
    level?:                number;
    attribute?:            string;
    linkval?:              number;
    linkmarkers?:          string[];
    pend_desc?:            string;
    monster_desc?:         string;
    scale?:                number;
    banlist_info?:         BanlistInfo;
}

export interface File {
    data: Card[];
}
