import { useDesktopSettings } from '~/composables/useDesktopSettings';
import { useRemoteSession } from '~/composables/useRemoteSession';
import type { TaskView } from '../../electron/contract';
import type { SearchPublicationGame } from '@tcg-cards/model/search/publication';

/** Drives one game's remote search database load from its own publish page. */
export function useSearchD1Publish(game: SearchPublicationGame) {
  const { snapshot } = useDesktopSettings();
  const { status: remoteStatus, refresh: refreshRemoteSession, requireSession } = useRemoteSession();
  const {
    entries,
    error,
    busy,
    launch,
    retry,
    control,
  } = useTaskControl([{
    taskType: `${game}_search_d1_publish`,
    label:    game === 'magic' ? '万智牌搜索数据发布（远程搜索库）' : '炉石传说搜索数据发布（远程搜索库）',
  }]);

  const task = computed(() => entries.value.find(entry => entry.taskType === `${game}_search_d1_publish`)?.task ?? null);
  const loggedIn = computed(() => remoteStatus.value?.loggedIn === true);
  const exportDirectory = computed(() => snapshot.value?.config.searchStorage.exportDirectory?.trim() ?? '');
  const canStart = computed(() => loggedIn.value && exportDirectory.value !== '');

  /** Launches the load after confirming the console login. */
  async function start() {
    if (!await requireSession()) return;
    await launch(`${game}_search_d1_publish`, {
      game,
      directory: exportDirectory.value,
    });
  }

  /** Retries the last interrupted load from its persisted checkpoint. */
  async function retryLoad(active: TaskView) {
    await retry(active);
  }

  /** Stops a load between segment boundaries. */
  async function cancelLoad(active: TaskView) {
    await control(active, 'cancel');
  }

  onMounted(() => {
    void refreshRemoteSession();
  });

  return {
    task,
    error,
    busy,
    loggedIn,
    exportDirectory,
    canStart,
    start,
    retryLoad,
    cancelLoad,
  };
}
