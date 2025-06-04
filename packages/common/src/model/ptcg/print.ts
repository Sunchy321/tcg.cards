import { Print as IPrint } from '@interface/ptcg/print';

import { WithUpdation, defaultToJSON } from '../updation';

export type IPrintDatabase = WithUpdation<IPrint>;

export const toJSON = defaultToJSON;

export type PrintUpdationView = {
    cardId:     string;
    set:        string;
    number:     string;
    lang:       string;
    scryfallId: string;
    key:        string;
    oldValue:   any;
    newValue:   any;
};

export type PrintUpdationCollection = {
    total:   number;
    key:     string;
    current: number;
    values:  PrintUpdationView[];
};
