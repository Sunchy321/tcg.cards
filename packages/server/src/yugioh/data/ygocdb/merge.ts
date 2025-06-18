import { ICardDatabase } from '@common/model/yugioh/card';

import { CCard } from './to-card';

import { Document } from 'mongoose';

import { uniq } from 'lodash';

import { bulkUpdation } from '@/yugioh/logger';

function assignCardLocalization(
    card: ICardDatabase,
    cLocs: ICardDatabase['localization'],
    dLocs: Omit<ICardDatabase['localization'][0], '__lastDate'>[],
    date: string,
) {
    const locs = uniq([
        ...cLocs.map(c => c.lang),
        ...dLocs.map(d => d.lang),
    ]);

    for (const loc of locs) {
        const cLoc = cLocs.find(c => c.lang === loc);
        const dLocOrig = dLocs.find(d => d.lang === loc);

        if (dLocOrig == null) {
            // won't delete, skip
            continue;
        }

        const dLoc = { ...dLocOrig, __lastDate: date };

        if (cLoc == null) {
            cLocs.push(dLoc);

            const fullKey = `localization[${loc}]`;

            if (card.__lockedPaths.includes(fullKey)) {
                continue;
            }

            card.__updations.push({
                key:      fullKey,
                oldValue: cLoc,
                newValue: dLocOrig,
            });

            continue;
        }

        const fullNameKey = `localization[${loc}].name`;
        const fullTypelineKey = `localization[${loc}].typeline`;
        const fullTextKey = `localization[${loc}].text`;

        if (cLoc.name !== dLocOrig.name) {
            if (!card.__lockedPaths.includes(fullNameKey)) {
                card.__updations.push({
                    key:      fullNameKey,
                    oldValue: cLoc.name,
                    newValue: dLocOrig.name,
                });

                cLoc.name = dLocOrig.name;
            }
        } else if (card.__lockedPaths.includes(fullNameKey)) {
            bulkUpdation.info(`Remove lockedPaths ${fullNameKey} (${cLoc.name}) for ${card.cardId}:${loc}`);
            card.__lockedPaths = card.__lockedPaths.filter(v => v !== fullNameKey);
        }

        if (cLoc.typeline !== dLocOrig.typeline) {
            if (!card.__lockedPaths.includes(fullTypelineKey)) {
                card.__updations.push({
                    key:      fullTypelineKey,
                    oldValue: cLoc.typeline,
                    newValue: dLocOrig.typeline,
                });

                cLoc.typeline = dLocOrig.typeline;
            }
        } else if (card.__lockedPaths.includes(fullTypelineKey)) {
            bulkUpdation.info(`Remove lockedPaths ${fullTypelineKey} (${cLoc.typeline}) for ${card.cardId}:${loc}`);
            card.__lockedPaths = card.__lockedPaths.filter(v => v !== fullTypelineKey);
        }

        if (cLoc.text !== dLocOrig.text) {
            if (!card.__lockedPaths.includes(fullTextKey)) {
                card.__updations.push({
                    key:      fullTextKey,
                    oldValue: cLoc.text,
                    newValue: dLocOrig.text,
                });

                cLoc.text = dLocOrig.text;
            }
        } else if (card.__lockedPaths.includes(fullTextKey)) {
            bulkUpdation.info(`Remove lockedPaths ${fullTextKey} (${cLoc.text}) for ${card.cardId}:${loc}`);
            card.__lockedPaths = card.__lockedPaths.filter(v => v !== fullTextKey);
        }
    }
}

export function combineCard(card: ICardDatabase, data: CCard): void {
    for (const k of Object.keys(data) as (keyof CCard)[]) {
        switch (k) {
        case 'cardId':
            break;

        case 'localization':
            assignCardLocalization(card, card.localization, data.localization, '');
            break;
        }
    }
}

export async function mergeCard(card: Document & ICardDatabase, data: CCard): Promise<void> {
    combineCard(card, data);

    if (card.modifiedPaths().length > 0) {
        await card.save();
    }
}
