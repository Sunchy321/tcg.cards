import { Card as ICard } from '@interface/integrated/card';

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
