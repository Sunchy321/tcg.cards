import { Card as ICard } from '@interface/ptcg/card';
import { Print as IPrint } from '@interface/ptcg/print';

import { WithUpdation, defaultToJSON } from '../updation';

export type ICardDatabase = WithUpdation<ICard>;

export const toJSON = defaultToJSON;

export type RelatedCard = {
    relation: string;
    cardId:   string;
    version?: {
        lang:   string;
        set:    string;
        number: string;
    };
};

export type CardPrintView = ICard & Omit<IPrint, 'name' | 'typeline' | 'text'> & {
    printName: string;
    printText: string;

    printTags: IPrint['tags'];

    versions: {
        lang:   string;
        set:    string;
        number: string;
        rarity: string;
    }[];

    relatedCards: RelatedCard[];
};

export type CardEditorView = {
    card:         ICard & { _id?: string, __lockedPaths: string[] };
    print:        IPrint & { _id?: string, __lockedPaths: string[] };
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
