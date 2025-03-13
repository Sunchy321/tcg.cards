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

    rarity: Rarity;
    finishes?: string[];

    tcgPlayerId?: number;
    cardMarketId?: number;
    cardTraderId?: number;
};
