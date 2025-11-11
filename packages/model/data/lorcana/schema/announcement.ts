import z from 'zod';

import { adjustment, gameChangeType, status } from './game-change';

export const announcementItem = z.strictObject({
    type:          gameChangeType,
    effectiveDate: z.string().nullable(),
    format:        z.string().nullable(),

    cardId: z.string().nullable(),
    setId:  z.string().nullable(),
    ruleId: z.string().nullable(),

    status: status.nullable(),
    score:  z.int().min(1).nullish(),

    adjustment:   adjustment.array().nullable(),
    relatedCards: z.string().array().nullable(),
});

export const announcement = z.strictObject({
    id: z.uuid(),

    source: z.string(),
    date:   z.string(),
    name:   z.string(),

    effectiveDate: z.string().nullable(),

    nextDate: z.string().nullable(),

    link: z.url().array(),

    items: announcementItem.array(),
});

export const announcementProfile = announcement.pick({
    source: true,
    date:   true,
    name:   true,
}).extend({
    id: z.uuid(),
});

export type Announcement = z.infer<typeof announcement>;
export type AnnouncementItem = z.infer<typeof announcementItem>;
export type AnnouncementProfile = z.infer<typeof announcementProfile>;
