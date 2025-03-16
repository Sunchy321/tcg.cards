import { Schema } from 'mongoose';

import conn from './db';

import { CardRelation as ICardRelation } from '@interface/lorcana/card-relation';

const CardRelationSchema = new Schema<ICardRelation>({
    relation: String,

    sourceId: String,
    targetId: String,

    targetVersion: {
        set:    String,
        number: String,
        lang:   String,
    },
});

const CardRelation = conn.model('card_relation', CardRelationSchema);

export default CardRelation;
