import { Card as ICard } from '@interface/magic/card';
import { Print as IPrint } from '@interface/magic/print';
import { Ruling } from '@interface/magic/ruling';

export type ICardDatabase = Omit<ICard, 'parts'> & {
    parts: (ICard['parts'][0] & {
        __costMap: Record<string, number>;
    })[];
};

export type CardPrintView = Omit<ICard, 'parts'> & Omit<IPrint, 'parts'> & {
    parts: (ICard['parts'][0] & IPrint['parts'][0] & {
        printName: IPrint['parts'][0]['name'];
        printTypeline: IPrint['parts'][0]['typeline'];
        printText: IPrint['parts'][0]['text'];
    })[];

    localTags: IPrint['tags'];

    versions: {
        lang: string;
        set: string;
        number: string;
        rarity: string;
    }[];

    relatedCards: {
        relation: string;
        cardId: string;
        version?: {
            lang: string;
            set: string;
            number: string;
        };
    }[];

    rulings: Ruling[];
};
