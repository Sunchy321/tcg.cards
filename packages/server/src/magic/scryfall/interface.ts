export type UUID = string;
export type URI = string;
export type Timestamp = string;
export type MimeType = string;
export type Encoding = string;

export type CardComponent = 'token'|'meld_part'|'meld_result'|'combo_piece';
export type Color = 'W'|'U'|'B'|'R'|'G';
export type Game = 'paper'|'arena'|'mtgo';
export type Legality = 'legal'|'not_legal'|'restricted'|'banned';

export type Colors = Color[];
export type Legalities = Record<string, Legality>;
