export type Layout = 'location' | 'normal';

export type Rarity = 'common' | 'enchanted' | 'legendary' | 'rare' | 'special' | 'super_rare' | 'uncommon';

export type Print = {
    cardId: string;

    lang: string;
    set: string;
    number: string;

    name: string;
    typeline: string;
    text: string;

    flavorText?: string;
    artist: string;

    imageUri: Record<string, string>;

    tags: string[];

    layout: Layout;
    rarity: Rarity;
    releaseDate: string;
    finishes?: string[];

    id: number;
    code: string;
    tcgPlayerId?: number;
    cardMarketId?: number;
    cardTraderId?: number;
};
