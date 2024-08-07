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

function assign<T>(card: Document & WithUpdation<T>, data: T, key: string & keyof T) {
    if (!isEqual(card[key], data[key])) {
        card.__updations.push({
            key,
            oldValue: card[key],
            newValue: data[key],
        });

        (card as any)[key] = data[key];
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
    if (!isEqual(cPart[key], dPart[key])) {
        card.__updations ??= [];

        card.__updations.push({
            key:       `parts.${key}`,
            partIndex: index,
            oldValue:  cPart[key],
            newValue:  dPart[key],
        });

        (cPart as any)[key] = dPart[key];
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

            card.__updations.push({
                key:       `parts.localization.${loc}`,
                partIndex: index,
                lang:      loc,
                oldValue:  cLoc,
                newValue:  dLoc,
            });
        } else {
            if (cLoc.name !== dLoc.name) {
                card.__updations.push({
                    key:       `parts.localization.${loc}.name`,
                    partIndex: index,
                    lang:      loc,
                    oldValue:  cLoc.name,
                    newValue:  dLoc.name,
                });

                cLoc.name = dLoc.name;
            }

            if (cLoc.typeline !== dLoc.typeline) {
                card.__updations.push({
                    key:       `parts.localization.${loc}.typeline`,
                    partIndex: index,
                    lang:      loc,
                    oldValue:  cLoc.typeline,
                    newValue:  dLoc.typeline,
                });

                cLoc.typeline = dLoc.typeline;
            }

            if (cLoc.text !== dLoc.text) {
                card.__updations.push({
                    key:       `parts.localization.${loc}.text`,
                    partIndex: index,
                    lang:      loc,
                    oldValue:  cLoc.text,
                    newValue:  dLoc.text,
                });

                cLoc.text = dLoc.text;
            }
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
    if (!isEqual(cType[key], dType[key])) {
        card.__updations ??= [];

        card.__updations.push({
            key:       `parts.type.${key}`,
            partIndex: index,
            oldValue:  cType[key],
            newValue:  dType[key],
        });

        (cType as any)[key] = dType[key];
    }
}

function assignSet<T>(card: Document & WithUpdation<T>, data: T, key: string & keyof T) {
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

export async function mergeCard(card: Document & ICardDatabase, data: ICard): Promise<void> {
    const updation: ICardUpdation[] = [];

    for (const k of Object.keys(data) as (keyof ICard)[]) {
        // eslint-disable-next-line default-case
        switch (k) {
        case 'cardId':
            throw new Error(`cardId mismatch: ${card.cardId} -- ${data.cardId}`);

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
                    case '__costMap':
                    case 'manaValue':
                    case 'color':
                    case 'colorIndicator':
                        assignPart(card, cPart, dPart, l, i);
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

    if (card.modifiedPaths().length > 0) {
        await card.save();
    }

    await CardUpdation.insertMany(updation);
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
