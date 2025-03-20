import { UUID, URI } from './basic';

export interface RawSet {
    id:               UUID;
    code:             string;
    mtgo_code?:       string;
    tcgplayer_id?:    number;
    name:             string;
    set_type:         string;
    released_at?:     string;
    block_code?:      string;
    block?:           string;
    parent_set_code?: string;
    card_count:       number;
    printed_size?:    number;
    digital:          boolean;
    foil_only:        boolean;
    nonfoil_only:     boolean;
    scryfall_uri:     URI;
    uri:              URI;
    icon_svg_uri:     URI;
    search_uri:       URI;
}
