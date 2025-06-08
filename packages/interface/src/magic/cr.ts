export interface Content {
    id:        string;
    depth:     number;
    index:     string;
    text:      string;
    examples?: string[];
    cards?:    { text: string, cardId: string, part?: number }[];
}

export interface Glossary {
    words: string[];
    ids:   string[];
    text:  string;
}

export interface CR {
    date:     string;
    intro:    string;
    contents: Content[];
    glossary: Glossary[];
    credits:  string;
    csi?:     string;
}
