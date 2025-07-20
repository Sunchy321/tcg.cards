import { db } from '@/drizzle';
import { Entity, EntityLocalization } from '@/hearthstone/schema/entity';
import { and, eq, getTableColumns } from 'drizzle-orm';

import { Entity as IEntity } from '@interface/hearthstone/entity';

export async function insert(entity: IEntity) {
    db.transaction(async tx => {
        const existingEntity = await db.select()
            .from(Entity)
            .where(and(
                ...Object.entries(getTableColumns(Entity))
                    .filter(([k, _v]) => k !== 'version')
                    .map(([k, v]) => eq(v, (entity as any)[k])),
            ));

        if (existingEntity.length > 0) {
            await tx.update(Entity)
                .set({ version: [...existingEntity[0].version, ...entity.version].sort() })
                .where(and(
                    eq(Entity.cardId, existingEntity[0].cardId),
                    eq(Entity.version, existingEntity[0].version),
                ));
        } else {
            await tx.insert(Entity).values(entity);
        }

        for (const loc of entity.localization) {
            const existingLocalization = await tx.select()
                .from(EntityLocalization)
                .where(and(
                    ...Object.entries(getTableColumns(EntityLocalization))
                        .filter(([k, _v]) => k !== 'version')
                        .map(([k, v]) => eq(v, (entity as any)[k])),
                ));

            if (existingLocalization.length > 0) {
                await tx.update(EntityLocalization)
                    .set({ version: [...existingLocalization[0].version, ...entity.version].sort() })
                    .where(and(
                        eq(EntityLocalization.cardId, entity.cardId),
                        eq(EntityLocalization.version, entity.version),
                        eq(EntityLocalization.lang, loc.lang),
                    ));
            } else {
                await tx.insert(EntityLocalization)
                    .values({ cardId: entity.cardId, version: entity.version, ...loc });
            }
        }
    });
}
