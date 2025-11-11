import { ORPCError, os } from '@orpc/server';

import z from 'zod';
import _ from 'lodash';
import { desc, eq } from 'drizzle-orm';

import { AnnouncementApplier } from '@/lorcana/banlist/apply';

import { announcement, announcementProfile } from '@model/lorcana/schema/announcement';

import { db } from '@/drizzle';
import { Announcement, AnnouncementItem } from '@/lorcana/schema/announcement';

const list = os
    .route({
        method:      'GET',
        description: 'Get the list of announcements',
        tags:        ['Lorcana', 'Announcement'],
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
        tags:        ['Lorcana', 'Announcement'],
    })
    .input(z.object({ id: z.uuid() }))
    .output(announcement)
    .handler(async ({ input }) => {
        const { id } = input;

        const announcement = await db.select().from(Announcement)
            .where(eq(Announcement.id, id))
            .then(rows => rows[0]);

        if (announcement == null) {
            throw new ORPCError('NOT_FOUND');
        }

        const items = await db.select()
            .from(AnnouncementItem)
            .where(eq(AnnouncementItem.announcementId, id));

        return {
            ...announcement,
            items: items.map(i => _.omit(i, ['id', 'announcementId'])),
        };
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

                    nextDate: data.nextDate,

                    link: data.link,
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
