import { z } from 'zod';

import { taskPageSnapshot } from '@tcg-cards/model/src/task';
import { os } from './index';
import { createAndRunTask } from './task';
import { testWorkTaskDefinition } from '../lib/task/test-definition';

const createTask = os
  .input(z.strictObject({
    workload: z.number().int().positive().default(20),
    shouldError: z.boolean().optional().default(false),
  }))
  .output(taskPageSnapshot)
  .handler(async ({ input }) => {
    return createAndRunTask(testWorkTaskDefinition.taskType, {
      taskType: testWorkTaskDefinition.taskType,
      definitionVersion: testWorkTaskDefinition.definitionVersion,
      scope: {
        type: testWorkTaskDefinition.scopeType,
        key: `workload:${input.workload}`,
        snapshot: {},
      },
      params: { workload: input.workload, shouldError: input.shouldError },
    });
  });

export const testRouter = { createTask };
