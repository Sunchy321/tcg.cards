import type { TaskDefinition } from '../task/registry';

/** Waits between progress updates so the development task remains observable. */
function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new Error('Task stopped'));
    }, { once: true });
  });
}

const definition: TaskDefinition = {
  stages: () => [{
    key:   'work',
    label: '执行中',
    total: 10,
    async run({ signal, progress }) {
      for (let step = 1; step <= 10; step++) {
        await delay(400, signal);
        await progress(step);
      }
    },
  }],
  result: () => ({ message: '已完成' }),
};

export default definition;
