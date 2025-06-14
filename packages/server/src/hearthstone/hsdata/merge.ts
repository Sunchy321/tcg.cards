import { Document } from 'mongoose';
import { Card as ICard } from '@interface/hearthstone/card';

export async function mergeCard(card: Document & ICard, data: ICard): Promise<void> {
    for (const k of Object.keys(data) as (keyof ICard)[]) {
        switch (k) {
        case 'cardId':
        case 'legalities':
            break;
        }
    }

    if (card.modifiedPaths().length > 0) {
        await card.save();
    }
}
