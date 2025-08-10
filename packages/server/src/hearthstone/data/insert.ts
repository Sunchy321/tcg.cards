import { and, arrayContains, eq, getTableColumns, inArray, sql } from 'drizzle-orm';

import { db } from '@/drizzle';
import { Card } from '@/hearthstone/schema/card';
import { Entity, EntityLocalization } from '@/hearthstone/schema/entity';
import { CardRelation } from '@/hearthstone/schema/card-relation';

import { Locale } from '@model/hearthstone/schema/basic';
import { Card as ICard } from '@model/hearthstone/schema/card';
import { Entity as IEntity } from '@model/hearthstone/schema/entity';
import { CardRelation as ICardRelation } from '@model/hearthstone/schema/card-relation';

import _ from 'lodash';

export async function insertCards(cards: ICard[]) {
    await db.transaction(async tx => {
        const existingCards = await tx.select({ cardId: Card.cardId })
            .from(Card);

        const newCards = cards.filter(card => !existingCards.some(existing => existing.cardId === card.cardId));

        if (newCards.length > 0) {
            await tx.insert(Card).values(newCards);
        }
    });
}

export async function insertEntities(entities: IEntity[], version: number, lastVersion: number) {
    await db.transaction(async tx => {
        const existingEntity = await tx.select()
            .from(Entity)
            .where(arrayContains(Entity.version, [version]));

        const newEntities = entities.filter(entity =>
            !existingEntity.some(existing => existing.cardId === entity.cardId),
        );

        const prevEntities = await tx.select()
            .from(Entity)
            .where(and(
                arrayContains(Entity.version, [lastVersion]),
                inArray(Entity.cardId, newEntities.map(e => e.cardId)),
            ));

        const prevLocalizations = await tx.select()
            .from(EntityLocalization)
            .where(and(
                arrayContains(EntityLocalization.version, [lastVersion]),
                inArray(EntityLocalization.cardId, newEntities.map(e => e.cardId)),
            ));

        const entitiesToInsert: IEntity[] = [];
        const entitiesToUpdate: { cardId: string }[] = [];

        const localizationToInsert: (IEntity['localization'][0] & { cardId: string, version: number[] })[] = [];
        const localizationToUpdate: { cardId: string, lang: Locale }[] = [];

        for (const entity of newEntities) {
            const prevEntity = prevEntities.find(e => e.cardId === entity.cardId);

            if (prevEntity == null) {
                entitiesToInsert.push(entity);
            } else {
                // Check if two entities are the same
                const isSame = Object.keys(getTableColumns(Entity))
                    .filter(k => k !== 'version')
                    .every(k => _.isEqual((entity as any)[k], (prevEntity as any)[k]));

                if (isSame) {
                    entitiesToUpdate.push({ cardId: entity.cardId });
                } else {
                    entitiesToInsert.push(entity);
                }
            }

            for (const loc of entity.localization) {
                const prevLocalization = prevLocalizations.find(l => l.cardId === entity.cardId && l.lang === loc.lang);

                if (prevLocalization == null) {
                    localizationToInsert.push({
                        cardId:  entity.cardId,
                        version: entity.version,
                        ...loc,
                    });
                } else {
                    // Check if two localizations are the same
                    const isSameLoc = Object.keys(getTableColumns(EntityLocalization))
                        .filter(k => k !== 'version' && k !== 'cardId')
                        .every(k => _.isEqual((loc as any)[k], (prevLocalization as any)[k]));

                    if (isSameLoc) {
                        // If the localizations are the same, we can just update the version
                        localizationToUpdate.push({
                            cardId: entity.cardId,
                            lang:   loc.lang,
                        });
                    } else {
                        // If the localizations are different, we need to insert a new one
                        localizationToInsert.push({
                            cardId:  entity.cardId,
                            version: entity.version,
                            ...loc,
                        });
                    }
                }
            }
        }

        if (entitiesToInsert.length > 0) {
            for (const bucket of _.chunk(entitiesToInsert, 500)) {
                await tx.insert(Entity).values(bucket);
            }
        }

        if (entitiesToUpdate.length > 0) {
            await tx.update(Entity)
                .set({ version: sql`sort(array_append(${Entity.version}, ${version}))` })
                .where(and(
                    inArray(Entity.cardId, entitiesToUpdate.map(e => e.cardId)),
                    arrayContains(Entity.version, [lastVersion]),
                ));
        }

        if (localizationToInsert.length > 0) {
            for (const bucket of _.chunk(localizationToInsert, 500)) {
                await tx.insert(EntityLocalization).values(bucket);
            }
        }

        if (localizationToUpdate.length > 0) {
            const group = _.groupBy(localizationToUpdate, l => l.lang);

            for (const lang in group) {
                const locs = group[lang];
                await tx.update(EntityLocalization)
                    .set({ version: sql`sort(array_append(${EntityLocalization.version}, ${version}))` })
                    .where(and(
                        inArray(EntityLocalization.cardId, locs.map(l => l.cardId)),
                        eq(EntityLocalization.lang, lang as Locale),
                        arrayContains(EntityLocalization.version, [lastVersion]),
                    ));
            }
        }
    });
}

export async function insertRelation(relation: ICardRelation) {
    await db.transaction(async tx => {
        const prevRelation = await tx.select()
            .from(CardRelation)
            .where(and(
                eq(CardRelation.sourceId, relation.sourceId),
                eq(CardRelation.targetId, relation.targetId),
                eq(CardRelation.relation, relation.relation),
            ));

        if (prevRelation.length > 0) {
            await tx.update(CardRelation)
                .set({ version: sql`sort(array_append(${CardRelation.version}, ${relation.version}))` })
                .where(and(
                    eq(CardRelation.sourceId, relation.sourceId),
                    eq(CardRelation.targetId, relation.targetId),
                    eq(CardRelation.relation, relation.relation),
                ));
        } else {
            await tx.insert(CardRelation).values(relation);
        }
    });
}
