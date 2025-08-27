import { Card as ICard } from 'card-interface/src/omnisearch/card';

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
