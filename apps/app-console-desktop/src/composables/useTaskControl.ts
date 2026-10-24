import type { TaskView } from '../../electron/contract';
import { isTaskActive, useTasks } from './useTasks';

/** One task type a control can start, labelled for the page it lives on. */
export interface TaskControlDescriptor {
  taskType: string;
  label:    string;
}

/** One page-level launcher bound to every task type its control can start. */
export function useTaskControl(descriptors: TaskControlDescriptor[]) {
  const { accepted, refresh, taskOfType, update } = useTasks();
  const existingNotice = ref('');
  const error = ref('');
  const busy = ref(false);

  const entries = computed(() => descriptors.map(descriptor => ({
    ...descriptor,
    task: taskOfType(descriptor.taskType),
  })));
  /** Any unfinished run of the listed task types occupies the whole control. */
  const occupying = computed(() => entries.value.find(entry => entry.task && isTaskActive(entry.task))?.task ?? null);
  const blocked = computed(() => occupying.value !== null);

  onMounted(() => {
    void refresh(descriptors.map(descriptor => descriptor.taskType));
  });

  /** Starts a new run of one task type with the page's current parameters. */
  async function launch(taskType: string, params: Record<string, unknown>): Promise<void> {
    await operate(taskType, () => window.desktop.tasks.start(taskType, params));
  }

  /** Starts a new run that reuses the original parameters of one terminal run. */
  async function retry(task: TaskView): Promise<void> {
    await operate(task.taskType, () => window.desktop.tasks.retry(task.id));
  }

  /** Pauses, continues or cancels the run that occupies this control. */
  async function control(task: TaskView, kind: 'pause' | 'resume' | 'cancel'): Promise<void> {
    if (busy.value) return;
    busy.value = true;
    error.value = '';
    try {
      update(await window.desktop.tasks.control(task.id, kind));
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '无法执行任务控制';
    } finally {
      busy.value = false;
    }
  }

  /** Shares one request path for launch and retry so existing runs surface the same way. */
  async function operate(taskType: string, request: () => Promise<{ taskRunId: string, existing: boolean }>): Promise<void> {
    if (busy.value) return;
    busy.value = true;
    error.value = '';
    existingNotice.value = '';
    try {
      const reply = await request();
      if (reply.existing) {
        existingNotice.value = '已有任务，正在显示现有任务。';
        void refresh([taskType]);
      } else {
        accepted(reply.taskRunId, taskType, descriptors.find(descriptor => descriptor.taskType === taskType)?.label ?? taskType);
      }
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '无法启动任务';
    } finally {
      busy.value = false;
    }
  }

  return { entries, occupying, blocked, existingNotice, error, busy, launch, retry, control, refresh };
}
