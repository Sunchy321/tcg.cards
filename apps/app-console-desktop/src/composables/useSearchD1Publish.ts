import type { SearchPublicationGame } from '@tcg-cards/model/search/publication';
import type { TaskPageSnapshot } from '@tcg-cards/model/task';

import type { TaskOperation } from '~/components/task/TaskController.vue';
import { useDesktopSettings } from '~/composables/useDesktopSettings';
import { usePublishTargetSelection } from '~/composables/usePublishTargetSelection';
import { useRemoteSession } from '~/composables/useRemoteSession';
import { isTaskActive } from '~/composables/useTasks';

/** Drives one game's remote search database load from its own publish page. */
export function useSearchD1Publish(game: SearchPublicationGame) {
  const { snapshot } = useDesktopSettings();
  const { status: remoteStatus, refresh: refreshRemoteSession, requireSession } = useRemoteSession();
  const selection = usePublishTargetSelection(game, 'account');
  const taskType = `${game}_search_d1_publish`;
  const { entries, error: launchError, busy, launch } = useTaskControl([{
    taskType,
    label: game === 'magic' ? '万智牌搜索数据发布（远程搜索库）' : '炉石传说搜索数据发布（远程搜索库）',
  }]);
  const controller = ref<{ attach(snapshot: TaskPageSnapshot): void, currentTaskRunId: string | null }>();

  const task = computed(() => entries.value[0]?.task ?? null);
  const loggedIn = computed(() => remoteStatus.value?.loggedIn === true);
  const exportDirectory = computed(() => snapshot.value?.config.searchStorage.exportDirectory?.trim() ?? '');
  const error = computed(() => selection.error.value || launchError.value || (task.value?.pageSnapshot ? '' : task.value?.errorMessage ?? ''));
  const targetLocked = computed(() => busy.value || (task.value !== null && isTaskActive(task.value)));
  const operations = computed<TaskOperation[]>(() => [{
    key:      taskType,
    label:    '发布到远程搜索库',
    icon:     'i-lucide-database',
    disabled: targetLocked.value || !loggedIn.value || selection.selected.value?.configured !== true || exportDirectory.value === '',
    create:   start,
  }]);

  /** Launches the load after confirming the console login. */
  async function start() {
    const target = selection.selected.value;
    if (target?.configured && await requireSession()) {
      await launch(taskType, { game, directory: exportDirectory.value, targetId: target.id });
    }
    return null;
  }

  // The host can accept a run before its first page snapshot is saved.
  watch([controller, task], ([control, current]) => {
    if (control && current?.pageSnapshot && control.currentTaskRunId !== current.id) {
      control.attach(current.pageSnapshot);
    }
  }, { flush: 'post' });

  onMounted(() => {
    void refreshRemoteSession();
  });

  return { ...selection, controller, error, loggedIn, exportDirectory, operations, targetLocked };
}
