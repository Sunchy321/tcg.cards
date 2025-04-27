import { Card as ICard } from '@interface/yugioh/card';
import { Print as IPrint } from '@interface/yugioh/print';
import { ICardDatabase } from '@common/model/yugioh/card';
import CardUpdation, { ICardUpdation } from '@/magic/db/card-updation';
import { WithUpdation } from 'card-common/src/model/updation';

import { Document } from 'mongoose';

import { isEqual, uniq } from 'lodash';

import { bulkUpdation } from '@/yugioh/logger';

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

function assignCardLocalization(
    card: ICardDatabase,
    cLocs: ICardDatabase['localization'],
    dLocs: ICardDatabase['localization'],
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

            const fullKey = `localization[${loc}]`;

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

        const fullNameKey = `localization[${loc}].name`;
        const fullTypelineKey = `localization[${loc}].typeline`;
        const fullTextKey = `localization[${loc}].text`;

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
    cType: ICardDatabase['type'],
    dType: ICardDatabase['type'],
    key: keyof ICardDatabase['type'],
) {
    const fullKey = `type.${key}`;

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

export function combineCard(card: ICardDatabase, data: ICard): void {
    for (const k of Object.keys(data) as (keyof ICard)[]) {
        switch (k) {
        case 'cardId':
            break;

        case 'localization':
            assignCardLocalization(card, card.localization, data.localization);
            break;

        case 'type': {
            assignCardType(card, card.type, data.type, 'main');
            assignCardType(card, card.type, data.type, 'sub');

            break;
        }

        case 'attribute':
        case 'level':
        case 'rank':
        case 'linkValue':
        case 'linkMarkers':
        case 'attack':
        case 'defense':
        case 'race':
        case 'pendulumScale':
            assign(card, data, k);
            break;

        case 'category':
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

export async function mergePrint(print: Document & WithUpdation<IPrint>, data: IPrint): Promise<void> {
    const updation: ICardUpdation[] = [];

    for (const k of Object.keys(data) as (keyof IPrint)[]) {
        switch (k) {
        case 'cardId':
            break;

        case 'lang':
            break;
        case 'set':
        case 'number':
            assign(print, data, k);
            break;

        case 'name':
        case 'typeline':
        case 'text':
            assign(print, data, k);
            break;

        case 'layout':
        case 'rarity':
            assign(print, data, k);
            break;
        }
    }

    if (print.modifiedPaths().length > 0) {
        await print.save();
    }

    await CardUpdation.insertMany(updation);
}
