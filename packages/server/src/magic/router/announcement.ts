import { Hono } from 'hono';
import { describeRoute } from 'hono-openapi';
import { resolver, validator } from 'hono-openapi/zod';

import z from 'zod';
import _ from 'lodash';
import { desc, eq } from 'drizzle-orm';

import { AnnouncementApplier } from '@/magic/banlist/apply';

import { announcement, AnnouncementProfile, announcementProfile } from '@model/magic/schema/announcement';

import { db } from '@/drizzle';
import { Announcement, AnnouncementItem } from '@/magic/schema/announcement';

export const announcementRouter = new Hono()
    .get(
        '/list',
        describeRoute({
            description: 'Get the list of announcements',
            tags:        ['Magic', 'Announcement'],
            responses:   {
                200: {
                    description: 'List of announcements',
                    content:     {
                        'application/json': {
                            schema: resolver(announcementProfile.array()),
                        },
                    },
                },
            },
            validateResponse: true,
        }),
        async c => {
            const announcements = await db.select({
                id:     Announcement.id,
                source: Announcement.source,
                date:   Announcement.date,
                name:   Announcement.name,
            })
                .from(Announcement)
                .orderBy(desc(Announcement.date));

            return c.json(announcements satisfies AnnouncementProfile[]);
        },
    )
    .get(
        '/full',
        describeRoute({
            description: 'Get the list of announcements',
            tags:        ['Magic', 'Announcement'],
            responses:   {
                200: {
                    description: 'List of announcements',
                    content:     {
                        'application/json': {
                            schema: resolver(announcement),
                        },
                    },
                },
            },
            validateResponse: true,
        }),
        validator('query', z.object({ id: z.uuid() })),
        async c => {
            const { id } = c.req.valid('query');

            const announcement = await db.select().from(Announcement)
                .where(eq(Announcement.id, id))
                .then(rows => rows[0]);

            if (announcement == null) {
                return c.notFound();
            }

            const items = await db.select()
                .from(AnnouncementItem)
                .where(eq(AnnouncementItem.announcementId, id));

            return c.json({
                ...announcement,
                items: items.map(i => _.omit(i, ['id', 'announcementId'])),
            });
        },
    )
    .post(
        '/save',
        describeRoute({
            description: 'Save an announcement',
            tags:        ['Magic', 'Announcement'],
            responses:   {
                200: {
                    description: 'Announcement saved',
                    content:     {
                        'application/json': {
                            schema: resolver(z.object({ id: z.string() })),
                        },
                    },
                },
            },
            validateResponse: true,
        }),
        validator('json', announcement.extend({ id: z.uuid().or(z.literal('')) })),
        async c => {
            const data = c.req.valid('json');

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

                        effectiveDate:         data.effectiveDate,
                        effectiveDateTabletop: data.effectiveDateTabletop,
                        effectiveDateOnline:   data.effectiveDateOnline,
                        effectiveDateArena:    data.effectiveDateArena,

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

            return c.json({ id: data.id });
        },
    )
    .post(
        '/apply',
        describeRoute({
            description: 'Get a random card ID',
            tags:        ['Magic', 'Card'],
            responses:   {
                200: {
                    description: 'Random card ID',
                },
            },
            validateResponse: true,
        }),
        async c => {
            const applier = new AnnouncementApplier();

            await applier.apply();

            return c.json({ success: true });
        },
    );
