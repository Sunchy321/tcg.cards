import { Schema } from 'mongoose';

import conn from './db';

export type ICardUpdation = {
    cardId: string;
    scryfallId: string;
    key: string;
    partIndex?: number;
    oldValue: any;
    newValue: any;
};

const CardUpdationSchema = new Schema<ICardUpdation>({
    cardId:     String,
    scryfallId: String,
    key:        String,
    partIndex:  Number,
    oldValue:   Object,
    newValue:   Object,
});

const CardUpdation = conn.model<ICardUpdation>('card_updation', CardUpdationSchema);

export default CardUpdation;
