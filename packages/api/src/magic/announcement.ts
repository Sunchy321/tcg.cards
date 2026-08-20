import { oc } from '@orpc/contract';

import z from 'zod';

import { defineFactTableContract } from '../factory';

import { announcement } from '@tcg-cards/model/magic/schema/announcement';

const list = oc
  .route({
    method:      'GET',
    description: 'List announcements ordered by date descending',
    tags:        ['Magic', 'Announcement'],
  })
  .output(announcement.array());

const detail = defineFactTableContract({
  description: 'Get an announcement by id',
  tags:        ['Magic', 'Announcement'],
  pk:          { id: { schema: z.string() } },
  output:      announcement,
});

export const announcementRouter = { list, detail };
