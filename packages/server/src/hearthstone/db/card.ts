import { Document, Model, Schema } from 'mongoose';

import conn from './db';

import { Card as ICard } from '@interface/hearthstone/card';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
const CardSchema = new Schema<ICard, Model<ICard>, {}, {}, {}, {}, '$type'>({
    cardId: String,

    entityId: [String],

    legality: Object,
}, {
    typeKey: '$type',
    toJSON:  {
        transform(doc, ret) {
            delete ret._id;
            delete ret.__v;

            return ret;
        },
    },
});

const Card = conn.model<Document & ICard>('card', CardSchema);

export default Card;
