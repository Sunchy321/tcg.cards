export type Color = 'amber' | 'amethyst' | 'emerald' | 'ruby' | 'sapphire' | 'steel';

export type MainType = 'action' | 'character' | 'item' | 'location';

export interface Card {
    cardId: string;

    cost: number;
    color: Color[];

    inkwell: boolean;

    name: string;
    typeline: string;
    text: string;

    type: {
        main: MainType;
        sub?: string[];
    };

    localization: {
        lang: string;
        name: string;
        typeline: string;
        text: string;
    }[];

    lore?: number;
    strength?: number;
    willPower?: number;
    moveCost?: number;
}
