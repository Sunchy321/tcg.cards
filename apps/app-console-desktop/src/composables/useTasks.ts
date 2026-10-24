import type { TaskView } from '../../electron/contract';

/** Statuses that still occupy the single run slot of one task type. */
export const ACTIVE_TASK_STATUSES: readonly string[] = [
  'pending', 'running', 'pausing', 'paused', 'resuming', 'canceling', 'interrupted',
];

/** Reports whether one task snapshot still occupies its task type. */
export function isTaskActive(task: TaskView): boolean {
  return ACTIVE_TASK_STATUSES.includes(task.status);
}

const tasks = shallowRef<Record<string, TaskView>>({});
const listError = ref('');
let listening = false;

/** Merges one task update into the global renderer snapshot. */
function update(task: TaskView): void {
  if (task.status === 'discarded') {
    if (!(task.id in tasks.value)) return;
    const next = { ...tasks.value };
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete next[task.id];
    tasks.value = next;
    return;
  }
  tasks.value = { ...tasks.value, [task.id]: task };
}

/** Provides the same task state to pages and the global header. */
export function useTasks() {
  const active = computed(() => Object.values(tasks.value).filter(isTaskActive));

  /** Reconciles renderer memory with the task host's unfinished runs. */
  async function refresh(types?: string[]): Promise<void> {
    try {
      const settings = await window.desktop.settings.read();
      const latest = await window.desktop.tasks.list();
      const typed = types && types.length > 0 ? await window.desktop.tasks.latestByTypes(types) : [];
      const next = Object.fromEntries(Object.entries(tasks.value).filter(([, task]) =>
        !isTaskActive(task)
        || (task.phase === 'accepted' && Date.now() - Date.parse(task.createdAt) < 5_000),
      ));
      for (const task of [...latest, ...typed]) next[task.id] = task;
      tasks.value = next;
      listError.value = settings.credentials.database ? '' : '请先在设置中填写本地数据库连接。';
    } catch (error) {
      listError.value = error instanceof Error ? error.message : '无法读取任务';
    }
  }

  /** Installs one application-wide listener independent of task pages. */
  function listen(): void {
    if (listening) return;
    listening = true;
    window.desktop.tasks.onChange(update);
    void refresh();
  }

  /** Accepts the identity returned before the task is saved. */
  function accepted(taskRunId: string, taskType: string, label: string): void {
    if (tasks.value[taskRunId]) return;
    update({
      id:           taskRunId,
      taskType,
      label,
      status:       'pending',
      phase:        'accepted',
      elapsedMs:    0,
      stages:       [],
      result:       null,
      errorMessage: null,
      createdAt:    new Date().toISOString(),
      startedAt:    null,
      finishedAt:   null,
    });
  }

  /** Returns the task that currently speaks for one task type. */
  function taskOfType(taskType: string): TaskView | null {
    const of = Object.values(tasks.value).filter(task => task.taskType === taskType);
    const unfinished = of
      .filter(isTaskActive)
      .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
    if (unfinished.length > 0) return unfinished[0]!;
    return of.sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0] ?? null;
  }

  return { tasks: readonly(tasks), active, listError: readonly(listError), refresh, listen, accepted, taskOfType, update };
}
