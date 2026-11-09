import { oc } from '@orpc/contract';

import z from 'zod';

import { defineFactTableContract } from '../factory';

import { announcement } from '@tcg-cards/model/magic/schema/announcement';

const list = oc
  .route({
    method: 'GET',
    tags:   ['Magic', 'Announcement'],
  })
  .output(announcement.array());

const detail = defineFactTableContract({
  tags:   ['Magic', 'Announcement'],
  pk:     { id: { schema: z.string() } },
  output: announcement,
});

export const announcementRouter = { list, detail };
