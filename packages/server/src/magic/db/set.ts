import { Document, Model, Schema } from 'mongoose';

import { ISet as IScryfallSet } from './scryfall/set';

import conn from './db';

interface ISetLocalization {
    lang: string,
        name: string,
        block?: string,
}

export interface ISet {
    setId: string,

    scryfall: {
        id: string,
        code: string,
    },

    onlineCode?: string,
    tcgplayerId?: number,

    block?: string,
    parent?: string,

    localizations: ISetLocalization[],

    setType: string,
    isDigital: boolean,
    isFoilOnly: boolean,
    isNonfoilOnly: boolean,

    releaseDate?: string,

    cardCount: number,
    printedSize?: number,
}

interface ISetMethods {
    localization(lang: string): ISetLocalization;
}

export const SetSchema = new Schema({
    setId: String,

    scryfall: {
        id:   String,
        code: String,
    },

    onlineCode:  String,
    tcgplayerId: Number,

    block:  String,
    parent: String,

    localizations: [
        {
            _id:   false,
            lang:  String,
            name:  String,
            block: String,
            link:  String,
        },
    ],

    setType:       String,
    isDigital:     Boolean,
    isFoilOnly:    Boolean,
    isNonfoilOnly: Boolean,

    releaseDate: String,

    cardCount:   Number,
    printedSize: Number,
});

type ISetDoc = ISet & ISetMethods & Document;

SetSchema.methods.localization = function(this: ISetDoc, lang: string): ISetLocalization {
    for (const l of this.localizations) {
        if (l.lang === lang) {
            return l;
        }
    }

    const loc = {
        lang, name: '',
    };

    this.localizations.push(loc);

    return loc;
};

interface SetModel extends Model<ISetDoc> {
    mergeWith(data: IScryfallSet): Promise<void>
}

SetSchema.statics.mergeWith = async function(this: SetModel, data: IScryfallSet) {
    const set = await this.findOne({ 'scryfall.id': data.set_id });

    if (set == null) {
        const object: ISet = {
            setId: data.code,

            scryfall: {
                id:   data.set_id,
                code: data.code,
            },

            onlineCode:  data.mtgo_code,
            tcgplayerId: data.tcgplayer_id,

            block:  data.block_code,
            parent: data.parent_set_code,

            localizations: [{
                lang:  'en',
                name:  data.name,
                block: data.block,
            }],

            setType:       data.set_type,
            isDigital:     data.digital,
            isFoilOnly:    data.foil_only,
            isNonfoilOnly: data.nonfoil_only,

            releaseDate: data.released_at,

            cardCount:   data.card_count,
            printedSize: data.printed_size,
        };

        return this.create(object);
    } else {
        for (const k in data) {
            switch (k as keyof typeof data) {
            case 'set_id':
                // always equal, ignore
                break;
            case 'code':
                // ignore
                break;
            case 'mtgo_code':
                set.onlineCode = data.mtgo_code;
                break;
            case 'tcgplayer_id':
                set.tcgplayerId = data.tcgplayer_id;
                break;
            case 'name':
                set.localization('en').lang = data.name;
                break;
            case 'set_type':
                set.setType = data.set_type;
                break;
            case 'released_at':
                set.releaseDate = data.released_at;
                break;
            case 'block_code':
                set.block = data.block_code;
                break;
            case 'block':
                set.localization('en').block = data.block;
                break;
            case 'parent_set_code':
                set.parent = data.parent_set_code;
                break;
            case 'card_count':
                set.cardCount = data.card_count;
                break;
            case 'printed_size':
                set.printedSize = data.printed_size;
                break;
            case 'digital':
                set.isDigital = data.digital;
                break;
            case 'foil_only':
                set.isFoilOnly = data.foil_only;
                break;
            case 'nonfoil_only':
                set.isNonfoilOnly = data.nonfoil_only;
                break;
            case 'scryfall_uri':
            case 'uri':
            case 'icon_svg_uri':
            case 'search_uri':
                // ignore
                break;
            }

            await set.save();
        }
    }
};

const Set = conn.model<ISetDoc, SetModel>('set', SetSchema);

export default Set;
