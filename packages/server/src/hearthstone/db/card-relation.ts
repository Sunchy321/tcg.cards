import { Schema } from 'mongoose';

import conn from './db';

import { CardRelation as ICardRelation } from '@interface/hearthstone/card-relation';

const CardRelationSchema = new Schema<ICardRelation>({
    relation: String,
    version:  [Number],
    sourceId: String,
    targetId: String,
});

const CardRelation = conn.model('card_relation', CardRelationSchema);

export default CardRelation;
