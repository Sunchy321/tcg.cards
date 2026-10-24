import type { TaskView } from '../../electron/contract';

const tasks = shallowRef<Record<string, TaskView>>({});
const listError = ref('');
let listening = false;

/** Merges one task update into the global renderer snapshot. */
function update(task: TaskView): void {
  tasks.value = { ...tasks.value, [task.id]: task };
}

/** Provides the same task state to pages and the global header. */
export function useTasks() {
  const active = computed(() => Object.values(tasks.value).filter(task =>
    ['pending', 'running', 'pausing', 'paused', 'resuming', 'canceling', 'interrupted'].includes(task.status),
  ));

  /** Reconciles renderer memory with the task host's unfinished runs. */
  async function refresh(): Promise<void> {
    try {
      const settings = await window.desktop.settings.read();
      const latest = await window.desktop.tasks.list();
      const next = Object.fromEntries(Object.entries(tasks.value).filter(([, task]) =>
        !['pending', 'running', 'pausing', 'paused', 'resuming', 'canceling', 'interrupted'].includes(task.status)
        || (task.phase === 'accepted' && Date.now() - Date.parse(task.createdAt) < 5_000),
      ));
      for (const task of latest) next[task.id] = task;
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
  function accepted(taskRunId: string): void {
    if (tasks.value[taskRunId]) return;
    update({
      id:           taskRunId,
      taskType:     'dev_sample',
      label:        '测试任务',
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

  return { tasks: readonly(tasks), active, listError: readonly(listError), refresh, listen, accepted };
}
