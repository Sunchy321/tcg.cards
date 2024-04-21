/* eslint-disable camelcase */
import { ICard } from '@/magic/db/card-temp';
import CardUpdation, { ICardUpdation } from '@/magic/db/card-updation';

import { Document } from 'mongoose';

import { existsSync, unlinkSync } from 'fs';
import { isEqual } from 'lodash';

import { cardImagePath } from '@/magic/image';

function assign(card: Document & ICard, data: ICard, key: keyof ICard, updation: ICardUpdation[]) {
    if (!isEqual(card[key], data[key])) {
        updation.push({
            cardId:     card.cardId,
            scryfallId: card.scryfall.cardId!,
            key,
            oldValue:   card[key],
            newValue:   data[key],
        });

        (card as any)[key] = data[key];
    }
}

function assignPart(
    card: ICard['parts'][0],
    data: ICard['parts'][0],
    key: keyof ICard['parts'][0],
    cardId: string,
    scryfallId: string,
    index: number,
    updation: ICardUpdation[],
) {
    if (!isEqual(card[key], data[key])) {
        updation.push({
            cardId,
            scryfallId,
            key:       `parts.${key}`,
            partIndex: index,
            oldValue:  card[key],
            newValue:  data[key],
        });

        (card as any)[key] = data[key];
    }
}

function assignSet(card: string[], data: string[], tag: string) {
    if (data.includes(tag) && !card.includes(tag)) {
        card.push(tag);
    }

    if (!data.includes(tag) && card.includes(tag)) {
        card.splice(card.indexOf(tag), 1);
    }
}

export async function merge(card: Document & ICard, data: ICard): Promise<void> {
    const updation: ICardUpdation[] = [];

    for (const k of Object.keys(data) as (keyof ICard)[]) {
        // eslint-disable-next-line default-case
        switch (k) {
        case 'cardId':
            break;

        case 'lang':
            break;
        case 'set':
        case 'number':
        case 'manaValue':
        case 'colorIdentity':
            assign(card, data, k, updation);
            break;

        case 'parts': {
            if (card.parts.length !== data.parts.length) {
                throw new Error(`parts count mismatch: ${card.cardId}`);
            }

            for (let i = 0; i < data.parts.length; i += 1) {
                const cPart = card.parts[i];
                const dPart = data.parts[i];

                for (const l of Object.keys(dPart) as (keyof ICard['parts'][0])[]) {
                    // eslint-disable-next-line default-case
                    switch (l) {
                    case '__costMap':
                    case 'flavorName':
                    case 'flavorText':
                        break;
                    case 'cost':
                    case 'color':
                    case 'colorIndicator':
                    case 'typeSuper':
                    case 'typeMain':
                    case 'typeSub':
                    case 'power':
                    case 'toughness':
                    case 'loyalty':
                    case 'defense':
                    case 'handModifier':
                    case 'lifeModifier':
                    case 'attractionLights':
                    case 'scryfallIllusId':
                    case 'artist':
                    case 'watermark':
                        assignPart(cPart, dPart, l, card.cardId, card.scryfall.cardId!, i, updation);
                        break;

                    case 'oracle': {
                        if (cPart.oracle.name !== dPart.oracle.name) {
                            if (card.__oracle == null) {
                                card.__oracle = {};
                            }

                            card.__oracle.name = cPart.oracle.name;
                            cPart.oracle.name = dPart.oracle.name;

                            if (card.lang === 'en') {
                                cPart.unified.name = dPart.oracle.name;
                            }
                        }

                        if (cPart.oracle.typeline !== dPart.oracle.typeline) {
                            if (card.__oracle == null) {
                                card.__oracle = {};
                            }

                            card.__oracle.typeline = cPart.oracle.typeline;
                            cPart.oracle.typeline = dPart.oracle.typeline;

                            if (card.lang === 'en') {
                                cPart.unified.typeline = dPart.oracle.typeline;
                            }
                        }

                        if (cPart.oracle.text !== dPart.oracle.text) {
                            if (card.__oracle == null) {
                                card.__oracle = {};
                            }

                            card.__oracle.text = cPart.oracle.text;
                            cPart.oracle.text = dPart.oracle.text;

                            if (card.lang === 'en') {
                                cPart.unified.text = dPart.oracle.text;
                            }
                        }

                        break;
                    }

                    case 'unified':
                    case 'printed':
                        break;
                    }
                }
            }

            break;
        }

        case 'relatedCards':
            break;

        case 'rulings':
            break;

        case 'keywords':
        case 'producibleMana':
            assign(card, data, k, updation);
            break;

        case 'counters':
            break;

        case 'tags':
            if (!isEqual(card[k], data[k])) {
                updation.push({
                    cardId:     card.cardId,
                    scryfallId: card.scryfall.cardId!,
                    key:        k,
                    oldValue:   card[k],
                    newValue:   data[k],
                });
            }

            assignSet(card.tags, data.tags, 'reserved');
            assignSet(card.tags, data.tags, 'dev:counted');
            assignSet(card.tags, data.tags, 'dev:counted');
            break;

        case 'localTags':
            if (!isEqual(card[k], data[k])) {
                updation.push({
                    cardId:     card.cardId,
                    scryfallId: card.scryfall.cardId!,
                    key:        k,
                    oldValue:   card[k],
                    newValue:   data[k],
                });
            }

            assignSet(card.localTags, data.localTags, 'full-art');
            assignSet(card.localTags, data.localTags, 'oversized');
            assignSet(card.localTags, data.localTags, 'story-spotlight');
            assignSet(card.localTags, data.localTags, 'textless');
            break;

        case 'category':
        case 'layout':
        case 'rarity':
            break;
        case 'frame':
        case 'frameEffects':
        case 'borderColor':
        case 'cardBack':
        case 'securityStamp':
        case 'promoTypes':
        case 'releaseDate':
            assign(card, data, k, updation);
            break;

        case 'isDigital':
        case 'isPromo':
        case 'isReprint':
        case 'finishes':
            assign(card, data, k, updation);
            break;
        case 'hasHighResImage': {
            if (card.hasHighResImage !== data.hasHighResImage) {
                for (const type of ['png', 'border_crop', 'art_crop', 'large', 'normal', 'small']) {
                    const basePath = cardImagePath(type, data.set, data.lang, data.number);

                    if (existsSync(basePath)) {
                        unlinkSync(basePath);
                    }

                    for (let i = 0; i < data.parts.length; i += 1) {
                        const partPath = cardImagePath(type, data.set, data.lang, data.number, i);

                        if (existsSync(partPath)) {
                            unlinkSync(partPath);
                        }
                    }
                }

                card.hasHighResImage = data.hasHighResImage;
            }
            break;
        }
        case 'imageStatus':
            assign(card, data, 'imageStatus', updation);
            break;

        case 'legalities':
            break;
        case 'inBooster':
        case 'contentWarning':
        case 'games':
            assign(card, data, k, updation);
            break;

        case 'preview':
            break;

        case 'scryfall':
        case 'arenaId':
        case 'mtgoId':
        case 'mtgoFoilId':
        case 'multiverseId':
        case 'tcgPlayerId':
        case 'cardMarketId':
            assign(card, data, k, updation);
            break;

        case '__oracle':
            assign(card, data, '__oracle', updation);
            break;
        }
    }

    if (card.modifiedPaths().length > 0) {
        await card.save();
    }

    await CardUpdation.insertMany(updation);
}
