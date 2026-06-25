import { z } from 'zod';

import { taskPageSnapshot } from '@tcg-cards/model/src/task';
import { os } from './index';
import { createAndRunTask } from './task';
import {
  testWorkTaskType,
  testWorkDefinitionVersion,
} from '../lib/task/test-definition';

const createTask = os
  .input(z.strictObject({
    workload: z.number().int().positive().default(20),
  }))
  .output(taskPageSnapshot)
  .handler(async ({ input }) => {
    return createAndRunTask(testWorkTaskType, {
      taskType: testWorkTaskType,
      definitionVersion: testWorkDefinitionVersion,
      scope: { type: 'test_work', key: `workload:${input.workload}` },
      params: { workload: input.workload },
    });
  });

export const testRouter = { createTask };
