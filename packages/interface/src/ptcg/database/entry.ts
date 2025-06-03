export type Entry = {
    jp_id?:         number;
    url:            string;
    name:           string;
    img:            string;
    card_type:      string;
    game?:          string;
    lang?:          string;
    tags?:          string[];
    regulation?:    string;
    set_name?:      string;
    set_img?:       string | null;
    series?:        string | null;
    set_full_name?: string;
    set_code?:      string;
    date?:          string;
    number?:        string;
    set_total?:     string | number | null;
    sources?: {
        name: string;
        link: string | null;
    }[];
    pack?:                   string;
    rarity?:                 string;
    rarity_img?:             string | null;
    effect?:                 string;
    author?:                 string[] | string;
    technical_machine_rule?: string;
    pokedex_number?:         string | number;
    pokemon_category?:       string;
    height?:                 string;
    weight?:                 string;
    flavor_text?:            string;
    stage?:                  string;
    level?:                  string | number;
    hp?:                     string | number;
    types?:                  string[];
    held_item?: {
        item:   string;
        effect: string;
    };
    held_berry?: {
        berry:  string;
        effect: string;
    };
    poke_body?: {
        name:   string;
        effect: string;
    };
    poke_power?: {
        name:   string;
        effect: string;
    };
    ancient_trait?: {
        name:   string;
        effect: string;
    };
    vstar_power?: {
        type:    string;
        cost?:   string[];
        name:    string;
        damage?: string | {
            amount: number;
            suffix: string;
        } | null;
        effect: string;
    };
    abilities?: {
        name:   string;
        effect: string;
    }[];
    tera_effect?: string;
    attacks?: {
        cost:   string[];
        name:   string;
        damage: {
            amount: number;
            suffix: string;
        } | string | null;
        effect: string | null;
    }[];
    rule_box?: string;
    weakness?: {
        type:  string[];
        value: string | null;
    };
    resistance?: {
        type:  string[];
        value: string | null;
    };
    retreat?:     number;
    evolve_from?: string[] | string;
};
