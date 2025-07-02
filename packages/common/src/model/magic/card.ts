import { Card as ICard } from '@interface/magic/card';
import { Print as IPrint } from '@interface/magic/print';
import { Ruling } from '@interface/magic/ruling';

import { WithUpdation, defaultToJSON } from '../updation';
import { Computed } from '../computed';

import { uniq } from 'lodash';

export type ICardDatabase = Computed<WithUpdation<ICard>, [
    {
        source:   'parts.cost';
        computed: '__costMap';
        type:     Record<string, number>;
        watcher:  'costWatcher';
    },
]>;

export function costWatcher(newValue: string[]) {
    if (newValue == null) {
        this.__costMap = undefined;
        return newValue;
    }

    const costMap: Record<string, number> = { };

    for (const c of newValue) {
        if (/^\d+$/.test(c)) {
            costMap['<generic>'] = Number.parseInt(c, 10);
        } else {
            costMap[c] = (costMap[c] ?? 0) + 1;
        }
    }

    this.__costMap = costMap;

    return newValue;
}

export function onSave(this: ICardDatabase) {
    this.name = this.parts.map(p => p.name).join(' // ');
    this.typeline = this.parts.map(p => p.typeline).join(' // ');
    this.text = this.parts.map(p => p.text).join('\n////////////////////\n');

    const localization = [];

    const langs = [];

    for (const p of this.parts) {
        langs.push(...p.localization.map(l => l.lang));
    }

    for (const l of uniq(langs)) {
        const locs = this.parts.map(p => p.localization.find(loc => loc.lang === l));

        localization.push({
            lang:     l,
            name:     locs.map(loc => loc?.name ?? '').join(' // '),
            typeline: locs.map(loc => loc?.typeline ?? '').join(' // '),
            text:     locs.map(loc => loc?.text ?? '').join('\n////////////////////\n'),
        });
    }

    this.localization = localization;
}

export function toJSON(doc: any, ret: any): any {
    const newRet = defaultToJSON(doc, ret);

    for (const p of newRet.parts) {
        delete p.__costMap;
    }

    return newRet;
}

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
    card:         WithUpdation<ICard> & { _id?: string };
    print:        WithUpdation<IPrint> & { _id?: string };
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
