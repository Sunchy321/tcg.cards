import { Card as ICard } from '@interface/magic/card';
import { Print as IPrint } from '@interface/magic/print';
import { Ruling } from '@interface/magic/ruling';

import { WithUpdation } from '../updation';

export type ICardDatabase = WithUpdation<Omit<ICard, 'parts'> & {
    parts: (ICard['parts'][0] & {
        __costMap?: Record<string, number>;
    })[];
}>;

export type RelatedCard = {
    relation: string;
    cardId:   string;
    version?: {
        lang:   string;
        set:    string;
        number: string;
    };
};

export type CardPrintView = Omit<ICard, 'parts' | 'scryfall'> & Omit<IPrint, 'parts'> & {
    parts: (ICard['parts'][0] & IPrint['parts'][0] & {
        printName:     IPrint['parts'][0]['name'];
        printTypeline: IPrint['parts'][0]['typeline'];
        printText:     IPrint['parts'][0]['text'];
    })[];

    printTags: IPrint['tags'];

    versions: {
        lang:   string;
        set:    string;
        number: string;
        rarity: string;
    }[];

    relatedCards: RelatedCard[];

    rulings: Ruling[];
};

export type CardEditorView = {
    card:         ICard & { _id?: string, __lockedPaths: string[] };
    print:        IPrint & { _id?: string, __lockedPaths: string[] };
    partIndex?:   number;
    relatedCards: RelatedCard[];
};

export type CardUpdationView = {
    cardId:     string;
    scryfallId: string;
    key:        string;
    oldValue:   any;
    newValue:   any;
};

export type CardUpdationCollection = {
    total:   number;
    key:     string;
    current: number;
    values:  CardUpdationView[];
};
