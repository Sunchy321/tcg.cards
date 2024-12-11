/* eslint-disable camelcase */
import { Card as ICard } from '@interface/magic/card';
import { Print as IPrint } from '@interface/magic/print';
import { ICardDatabase } from '@common/model/magic/card';
import { IPrintDatabase } from '@common/model/magic/print';
import CardUpdation, { ICardUpdation } from '@/magic/db/card-updation';
import { WithUpdation } from 'card-common/src/model/updation';

import { Document } from 'mongoose';

import { existsSync, unlinkSync } from 'fs';
import { isEqual, uniq } from 'lodash';

import { cardImagePath } from '@/magic/image';
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

type Part = {
    parts: any[];
};

function assignPart<T extends Part, U extends WithUpdation<T>>(
    card: U,
    cPart: T['parts'][0],
    dPart: T['parts'][0],
    key: string & keyof T['parts'][0],
    index: number,
) {
    const fullKey = `parts[${index}].${key}`;

    if (card.__lockedPaths.includes(fullKey)) {
        return;
    }

    if (!isEqual(cPart[key], dPart[key])) {
        card.__updations ??= [];

        card.__updations.push({
            key:      fullKey,
            oldValue: cPart[key],
            newValue: dPart[key],
        });

        (cPart as any)[key] = dPart[key];
    } else if (card.__lockedPaths.includes(fullKey)) {
        bulkUpdation.info(`Remove lockedPaths ${fullKey} (${cPart[key]}) for ${card.cardId}`);
        card.__lockedPaths = card.__lockedPaths.filter(v => v !== fullKey);
    }
}

function assignCardLocalization(
    card: ICardDatabase,
    cLocs: ICardDatabase['parts'][0]['localization'],
    dLocs: ICardDatabase['parts'][0]['localization'],
    index: number,
) {
    const locs = uniq([
        ...cLocs.map(c => c.lang),
        ...dLocs.map(d => d.lang),
    ]);

    for (const loc of locs) {
        const cLoc = cLocs.find(c => c.lang === loc);
        const dLoc = dLocs.find(d => d.lang === loc);

        if (dLoc == null) {
            // won't delete, skip
            continue;
        }

        if (cLoc == null) {
            cLocs.push(dLoc);

            const fullKey = `parts[${index}].localization[${loc}]`;

            if (card.__lockedPaths.includes(fullKey)) {
                continue;
            }

            card.__updations.push({
                key:      fullKey,
                oldValue: cLoc,
                newValue: dLoc,
            });

            continue;
        }

        const fullNameKey = `parts[${index}].localization[${loc}].name`;
        const fullTypelineKey = `parts[${index}].localization[${loc}].typeline`;
        const fullTextKey = `parts[${index}].localization[${loc}].text`;

        if (cLoc.name !== dLoc.name) {
            if (!card.__lockedPaths.includes(fullNameKey)) {
                card.__updations.push({
                    key:      fullNameKey,
                    oldValue: cLoc.name,
                    newValue: dLoc.name,
                });

                cLoc.name = dLoc.name;
            }
        } else if (card.__lockedPaths.includes(fullNameKey)) {
            bulkUpdation.info(`Remove lockedPaths ${fullNameKey} (${cLoc.name}) for ${card.cardId}:${loc}`);
            card.__lockedPaths = card.__lockedPaths.filter(v => v !== fullNameKey);
        }

        if (cLoc.typeline !== dLoc.typeline) {
            if (!card.__lockedPaths.includes(fullTypelineKey)) {
                card.__updations.push({
                    key:      fullTypelineKey,
                    oldValue: cLoc.typeline,
                    newValue: dLoc.typeline,
                });

                cLoc.typeline = dLoc.typeline;
            }
        } else if (card.__lockedPaths.includes(fullTypelineKey)) {
            bulkUpdation.info(`Remove lockedPaths ${fullTypelineKey} (${cLoc.typeline}) for ${card.cardId}:${loc}`);
            card.__lockedPaths = card.__lockedPaths.filter(v => v !== fullTypelineKey);
        }

        if (cLoc.text !== dLoc.text) {
            if (!card.__lockedPaths.includes(fullTextKey)) {
                card.__updations.push({
                    key:      fullTextKey,
                    oldValue: cLoc.text,
                    newValue: dLoc.text,
                });

                cLoc.text = dLoc.text;
            }
        } else if (card.__lockedPaths.includes(fullTextKey)) {
            bulkUpdation.info(`Remove lockedPaths ${fullTextKey} (${cLoc.text}) for ${card.cardId}:${loc}`);
            card.__lockedPaths = card.__lockedPaths.filter(v => v !== fullTextKey);
        }
    }
}

function assignCardType(
    card: ICardDatabase,
    cType: ICardDatabase['parts'][0]['type'],
    dType: ICardDatabase['parts'][0]['type'],
    key: keyof ICardDatabase['parts'][0]['type'],
    index: number,
) {
    const fullKey = `parts[${index}].type.${key}`;

    if (card.__lockedPaths.includes(fullKey)) {
        return;
    }

    if (!isEqual(cType[key], dType[key])) {
        card.__updations ??= [];

        card.__updations.push({
            key:      fullKey,
            oldValue: cType[key],
            newValue: dType[key],
        });

        (cType as any)[key] = dType[key];
    } else if (card.__lockedPaths.includes(fullKey)) {
        bulkUpdation.info(`Remove lockedPaths ${fullKey} (${cType[key]}) for ${card.cardId}`);
        card.__lockedPaths = card.__lockedPaths.filter(v => v !== fullKey);
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

export function combineCard(card: ICardDatabase, data: ICard): void {
    for (const k of Object.keys(data) as (keyof ICard)[]) {
        // eslint-disable-next-line default-case
        switch (k) {
        case 'cardId':
            break;

        case 'manaValue':
        case 'colorIdentity':
            assign(card, data, k);
            break;

        case 'parts': {
            if (card.parts.length !== data.parts.length) {
                throw new Error(`parts count mismatch: ${card.cardId}`);
            }

            for (let i = 0; i < data.parts.length; i += 1) {
                const cPart = card.parts[i];
                const dPart = data.parts[i];

                for (const l of Object.keys(dPart) as (keyof ICardDatabase['parts'][0])[]) {
                    // eslint-disable-next-line default-case
                    switch (l) {
                    case 'name':
                    case 'typeline':
                    case 'text':
                        assignPart(card, cPart, dPart, l, i);
                        break;

                    case 'localization':
                        assignCardLocalization(card, cPart.localization, dPart.localization, i);
                        break;

                    case 'cost':
                    case 'manaValue':
                    case 'color':
                    case 'colorIndicator':
                        assignPart(card, cPart, dPart, l, i);
                        break;

                    case '__costMap':
                        break;

                    case 'type': {
                        const cType = cPart.type;
                        const dType = dPart.type;

                        assignCardType(card, cType, dType, 'super', i);
                        assignCardType(card, cType, dType, 'main', i);
                        assignCardType(card, cType, dType, 'sub', i);

                        break;
                    }

                    case 'power':
                    case 'toughness':
                    case 'loyalty':
                    case 'defense':
                    case 'handModifier':
                    case 'lifeModifier':
                        assignPart(card, cPart, dPart, l, i);
                        break;
                    }
                }
            }

            break;
        }

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

        case 'scryfall':
            assign(card, data, k);
            break;
        }
    }
}

export async function mergeCard(card: Document & ICardDatabase, data: ICard): Promise<void> {
    combineCard(card, data);

    if (card.modifiedPaths().length > 0) {
        await card.save();
    }
}

export async function mergePrint(print: Document & IPrintDatabase, data: IPrint): Promise<void> {
    const updation: ICardUpdation[] = [];

    for (const k of Object.keys(data) as (keyof IPrint)[]) {
        // eslint-disable-next-line default-case
        switch (k) {
        case 'cardId':
            break;

        case 'lang':
            break;
        case 'set':
        case 'number':
            assign(print, data, k);
            break;

        case 'parts': {
            if (print.parts.length !== data.parts.length) {
                throw new Error(`parts count mismatch: ${print.cardId}`);
            }

            for (let i = 0; i < data.parts.length; i += 1) {
                const cPart = print.parts[i];
                const dPart = data.parts[i];

                for (const l of Object.keys(dPart) as (keyof IPrint['parts'][0])[]) {
                    // eslint-disable-next-line default-case
                    switch (l) {
                    case 'name':
                    case 'typeline':
                    case 'text':
                        assignPart(print, cPart, dPart, l, i);
                        break;
                    case 'attractionLights':
                    case 'scryfallIllusId':
                        assignPart(print, cPart, dPart, l, i);
                        break;
                    case 'flavorName':
                    case 'flavorText':
                        break;
                    case 'artist':
                    case 'watermark':
                        assignPart(print, cPart, dPart, l, i);
                        break;
                    }
                }
            }

            break;
        }

        case 'tags':
            assignSet(print, data, 'tags');
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
            assign(print, data, k);
            break;
        case 'hasHighResImage': {
            if (print.hasHighResImage !== data.hasHighResImage) {
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

                print.hasHighResImage = data.hasHighResImage;
            }
            break;
        }
        case 'imageStatus':
            assign(print, data, 'imageStatus');
            break;

        case 'inBooster':
        case 'games':
            assign(print, data, k);
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
            assign(print, data, k);
            break;
        }
    }

    if (print.modifiedPaths().length > 0) {
        await print.save();
    }

    await CardUpdation.insertMany(updation);
}
