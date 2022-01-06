/* eslint-disable camelcase */

export type UUID = string;
export type URI = string;
export type Timestamp = string;
export type MimeType = string;
export type Encoding = string;

export type CardComponent = 'combo_piece' | 'meld_part' | 'meld_result' | 'token';
export type Color = 'B' | 'G' | 'R' | 'U' | 'W';
export type Game = 'arena' | 'mtgo' | 'paper';
export type Legality = 'banned' | 'legal' | 'not_legal' | 'restricted';
export type Finish = 'etched' | 'foil' | 'glossy' | 'nonfoil';

export type Colors = Color[];
export type Legalities = Record<string, Legality>;

export type Layout = "adventure" | "art_series" | "augment" | "class" | "double_faced_token" | "emblem" | "flip" | "host" | "leveler" | "meld" | "modal_dfc" | "normal" | "planar" | "reversible_card" | "saga" | "scheme" | "split" | "token" | "transform" | "vanguard"

export interface List<T> {
    object: 'list';
    total_cards?: number;
    has_more: boolean;
    next_page?: URI;
    data: T[];
    warning?: string[];
}
