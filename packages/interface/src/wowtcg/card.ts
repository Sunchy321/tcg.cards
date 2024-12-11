import {
    CardType, Class, DamageType, Race,
} from './basic';

export type Card = {
    cardId: string;

    parts: {
        name: string;
        typeline: string;
        text: string;

        cost?: number;
        type: CardType[];
        race?: Race;
        class?: Class;

        attack?: string;
        health?: string;
        damageType?: DamageType;

        isMaster?: boolean;
        talentSpec?: string;
        profession?: string[];
    }[];
};
