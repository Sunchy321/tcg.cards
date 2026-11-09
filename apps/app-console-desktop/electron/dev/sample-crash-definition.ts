import type { TaskDefinition } from '../task/registry';

// One persisted step proves progress was observable before the Worker died.
export default {
  stages: () => [{
    key:   'work',
    label: '执行中',
    total: 3,
    async run({ progress }) {
      await progress(1);
      // Ends only this Worker thread, the way an unexpected crash would.
      process.exit(7);
    },
  }],
} satisfies TaskDefinition;
