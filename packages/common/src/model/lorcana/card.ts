import { Card as ICard } from '@interface/lorcana/card';
import { Print as IPrint } from '@interface/lorcana/print';

import { WithUpdation } from '../updation';

export type ICardDatabase = WithUpdation<ICard>;

export type RelatedCard = {
    relation: string;
    cardId: string;
    version?: {
        lang: string;
        set: string;
        number: string;
    };
};

export type CardPrintView = ICard & IPrint & {
    printName: string;
    printTypeline: string;
    printText: string;

    versions: {
        lang: string;
        set: string;
        number: string;
        rarity: string;
    }[];
};

export type CardEditorView = {
    card: ICard & { _id?: string, __lockedPaths: string[] };
    print: IPrint & { _id?: string, __lockedPaths: string[] };
};

export type CardUpdationView = {
    cardId: string;
    scryfallId: string;
    key: string;
    oldValue: any;
    newValue: any;
};

export type CardUpdationCollection = {
    total: number;
    key: string;
    current: number;
    values: CardUpdationView[];
};
