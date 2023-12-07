import { Document } from 'mongoose';
import { Card as ICard } from '@interface/hearthstone/card';

import { isEqual } from 'lodash';

function assign(card: Document & ICard, data: ICard, key: keyof ICard) {
    if (!isEqual(card[key], data[key])) {
        (card as any)[key] = data[key];
    }
}

export async function mergeCard(card: Document & ICard, data: ICard): Promise<void> {
    for (const k of Object.keys(data) as (keyof ICard)[]) {
        // eslint-disable-next-line default-case
        switch (k) {
        case 'cardId':
        case 'version':
        case 'change':
        case 'entityId':
            break;

        case 'localization':
        case 'set':
        case 'classes':
        case 'type':
        case 'cost':
        case 'attack':
        case 'health':
        case 'durability':
        case 'armor':
        case 'rune':
        case 'race':
        case 'spellSchool':
        case 'quest':
        case 'techLevel':
        case 'inBobsTavern':
        case 'tripleCard':
        case 'raceBucket':
        case 'coin':
        case 'armorBucket':
        case 'buddy':
        case 'bannedRace':
        case 'mercenaryRole':
        case 'mercenaryFaction':
        case 'colddown':
        case 'collectible':
        case 'elite':
        case 'rarity':
        case 'artist':
        case 'mechanics':
        case 'referencedTags':
        case 'relatedEntities':
        case 'entourages':
        case 'heroPower':
        case 'heroicHeroPower':
        case 'deckOrder':
        case 'overrideWatermark':
        case 'deckSize':
        case 'localizationNotes':
            assign(card, data, k);
            break;
        }
    }

    if (card.modifiedPaths().length > 0) {
        await card.save();
    }
}
