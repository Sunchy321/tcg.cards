import { Card, card as cardSchema, CardLocalization, cardLocalization, CardPart, cardPart, CardPartLocalization, cardPartLocalization } from '@model/magic/schema/card';
import { Print, PrintPart, printPart } from '@model/magic/schema/print';
import { WithUpdation } from '@common/model/updation';

import { isEqual } from 'lodash';

import { bulkUpdation } from '@/magic/logger';

function get<T>(value: T, key: string & keyof T) {
    if ((value as any).toObject != null) {
        value = (value as any).toObject();
    }

    return value[key];
}

function assign<T>(card: WithUpdation<T>, data: T, key: string & keyof T) {
    const cardValue = get(card, key);
    const dataValue = get(data, key);

    if (card.__lockedPaths.includes(key)) {
        return;
    }

    if (!isEqual(cardValue, dataValue)) {
        card.__updations.push({
            key,
            oldValue: card[key],
            newValue: data[key],
        });

        (card as any)[key] = data[key];
    } else if (card.__lockedPaths.includes(key)) {
        bulkUpdation.info(`Remove lockedPaths ${key} (${cardValue}) for ${card?.cardId}`);
        card.__lockedPaths = card.__lockedPaths.filter(v => v !== key);
    }
}

function assignSet<T>(card: WithUpdation<T>, data: T, key: string & keyof T) {
    if (isEqual(card[key], data[key])) {
        return;
    }

    (data as any)[key] = (data as any)[key]
        .filter((v: string) => !v.startsWith('dev:') || (card as any)[key].includes(v))
        .sort();

    (card as any)[key] = (card as any)[key].sort();

    card.__updations ??= [];

    card.__updations.push({
        key,
        oldValue: card[key],
        newValue: data[key],
    });

    (card as any)[key] = data[key];
}

export async function mergeCard(card: WithUpdation<Card>, data: Card): Promise<void> {
    for (const k of cardSchema.keyof().options) {
        switch (k) {
        case 'cardId':
            break;

        case 'partCount':
            assign(card, data, k);
            break;

        case 'name':
        case 'typeline':
        case 'text':
            assign(card, data, k);
            break;

        case 'manaValue':
        case 'colorIdentity':
            assign(card, data, k);
            break;

        case 'keywords':
        case 'producibleMana':
            assign(card, data, k);
            break;

        case 'counters':
            break;

        case 'tags':
            assignSet(card, data, 'tags');
            break;

        case 'category':
            break;

        case 'legalities':
            break;

        case 'contentWarning':
            assign(card, data, k);
            break;

        case 'scryfallOracleId':
            assign(card, data, k);
            break;
        }
    }
}

export function mergeCardLocalization(card: WithUpdation<CardLocalization>, data: CardLocalization) {
    if (card.lang !== 'en' && card.__lastDate >= data.__lastDate) {
        return;
    }

    for (const k of cardLocalization.keyof().options) {
        switch (k) {
        case 'cardId':
        case 'lang':
            break;

        case 'name':
        case 'typeline':
        case 'text':
            assign(card, data, k);
            break;

        case '__lastDate':
            card.__lastDate = data.__lastDate;
            break;
        }
    }
}

export function mergeCardPart(card: WithUpdation<CardPart>, data: CardPart) {
    for (const k of cardPart.keyof().options) {
        switch (k) {
        case 'cardId':
        case 'partIndex':
            break;

        case 'name':
        case 'typeline':
        case 'text':
            assign(card, data, k);
            break;

        case 'cost':
        case 'manaValue':
        case 'color':
        case 'colorIndicator':
            assign(card, data, k);
            break;

        case 'typeSuper':
        case 'typeMain':
        case 'typeSub':
            assign(card, data, k);
            break;

        case 'power':
        case 'toughness':
        case 'loyalty':
        case 'defense':
        case 'handModifier':
        case 'lifeModifier':
            assign(card, data, k);
            break;
        }
    }
}

export function mergeCardPartLocalization(card: WithUpdation<CardPartLocalization>, data: CardPartLocalization) {
    for (const k of cardPartLocalization.keyof().options) {
        switch (k) {
        case 'cardId':
        case 'lang':
        case 'partIndex':
            break;

        case 'name':
        case 'typeline':
        case 'text':
            assign(card, data, k);
            break;
        }
    }
}

export async function mergePrint(print: WithUpdation<Print>, data: Print): Promise<void> {
    for (const k of Object.keys(data) as (keyof Print)[]) {
        switch (k) {
        case 'cardId':
            break;

        case 'lang':
            break;
        case 'set':
        case 'number':
            assign(print, data, k);
            break;

        case 'printTags':
            assignSet(print, data, 'printTags');
            break;

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
            assign(print, data, k);
            break;

        case 'isDigital':
        case 'isPromo':
        case 'isReprint':
        case 'finishes':
        case 'hasHighResImage':
        case 'imageStatus':
            assign(print, data, k);
            break;

        case 'inBooster':
        case 'games':
            assign(print, data, k);
            break;

        case 'previewDate':
        case 'previewSource':
        case 'previewUri':
            break;

        case 'scryfallOracleId':
        case 'scryfallCardId':
        case 'scryfallFace':
        case 'scryfallImageUris':
        case 'arenaId':
        case 'mtgoId':
        case 'mtgoFoilId':
        case 'multiverseId':
        case 'tcgPlayerId':
        case 'cardMarketId':
            assign(print, data, k);
            break;
        }
    }
}

export async function mergePrintPart(print: WithUpdation<PrintPart>, data: PrintPart): Promise<void> {
    for (const k of printPart.keyof().options) {
        switch (k) {
        case 'cardId':
        case 'lang':
        case 'set':
        case 'number':
        case 'partIndex':
            break;

        case 'name':
        case 'typeline':
        case 'text':
            assign(print, data, k);
            break;

        case 'attractionLights':
        case 'flavorName':
        case 'flavorText':
        case 'artist':
        case 'watermark':
        case 'scryfallIllusId':
            assign(print, data, k);
            break;
        }
    }
}
