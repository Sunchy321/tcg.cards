import { ORPCError, os } from '@orpc/server';

import z from 'zod';
import _, { omit } from 'lodash';
import { desc, eq, getTableColumns } from 'drizzle-orm';

import { AnnouncementApplier } from '@/hearthstone/banlist/apply';

import { announcement, announcementProfile } from '@model/hearthstone/schema/announcement';

import { db } from '@/drizzle';
import { Announcement, AnnouncementItem } from '@/hearthstone/schema/announcement';

const list = os
    .route({
        method:      'GET',
        description: 'Get the list of announcements',
        tags:        ['Hearthstone', 'Announcement'],
    })
    .input(z.any())
    .output(announcementProfile.array())
    .handler(async () => {
        const announcements = await db.select({
            id:     Announcement.id,
            source: Announcement.source,
            date:   Announcement.date,
            name:   Announcement.name,
        })
            .from(Announcement)
            .orderBy(desc(Announcement.date));

        return announcements;
    })
    .callable();

const full = os
    .route({
        method:      'GET',
        description: 'Get the full announcement by ID',
        tags:        ['Hearthstone', 'Announcement'],
    })
    .input(z.object({ id: z.uuid() }))
    .output(announcement)
    .handler(async ({ input }) => {
        const { id } = input;

        const announcementValue = await db.select().from(Announcement)
            .where(eq(Announcement.id, id))
            .then(rows => rows[0]);

        if (announcementValue == null) {
            throw new ORPCError('NOT_FOUND');
        }

        const items = await db.select({
            ...omit(getTableColumns(AnnouncementItem), ['id', 'announcementId']),
        })
            .from(AnnouncementItem)
            .where(eq(AnnouncementItem.announcementId, id));

        return { ...announcementValue, items };
    })
    .callable();

const save = os
    .input(announcement.extend({ id: z.uuid().or(z.literal('')) }))
    .output(z.void())
    .handler(async ({ input }) => {
        const data = input;

        const existing = data.id !== ''
            ? await db.select().from(Announcement)
                .where(eq(Announcement.id, data.id))
                .then(rows => rows[0])
            : null;

        let id = data.id;

        if (existing != null) {
            await db.update(Announcement)
                .set({
                    source: data.source,
                    date:   data.date,
                    name:   data.name,

                    effectiveDate: data.effectiveDate,

                    link: data.link,

                    version:     data.version,
                    lastVersion: data.lastVersion,
                })
                .where(eq(Announcement.id, data.id));
        } else {
            const result = await db.insert(Announcement).values(_.omit(data, 'id')).returning();

            id = result[0].id;
        }

        await db.delete(AnnouncementItem)
            .where(eq(AnnouncementItem.announcementId, id));

        for (const item of data.items) {
            await db.insert(AnnouncementItem).values({
                announcementId: id,
                ...item,
            });
        }
    });

const apply = os
    .input(z.void())
    .output(z.void())
    .handler(async () => {
        const applier = new AnnouncementApplier();

        await applier.apply();
    });

export const announcementTrpc = {
    list,
    full,
    save,
    apply,
};

export const announcementApi = {
    list,
    '': full,
};
