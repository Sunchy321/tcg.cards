import type { SearchPublicationGame } from '@tcg-cards/model/search/publication';
import type { TaskPageSnapshot } from '@tcg-cards/model/task';

import type { TaskOperation } from '~/components/task/TaskController.vue';
import { settingsError, useDesktopSettings } from '~/composables/useDesktopSettings';
import { usePublishTargetSelection } from '~/composables/usePublishTargetSelection';
import { useRemoteSession } from '~/composables/useRemoteSession';

/** Drives one game's remote search database load from its own publish page. */
export function useSearchD1Publish(game: SearchPublicationGame) {
  const { snapshot, update } = useDesktopSettings();
  const { status: remoteStatus, refresh: refreshRemoteSession, requireSession } = useRemoteSession();
  const selection = usePublishTargetSelection(game);
  const publishType = `${game}_search_d1_publish`;
  const exportType = `${game}_search_sqlite_export`;
  const { entries, occupying, error: launchError, busy, launch } = useTaskControl([
    { taskType: publishType, label: '发布到远程搜索库' },
    { taskType: exportType, label: '导出搜索数据' },
  ]);
  const controller = ref<{ attach(snapshot: TaskPageSnapshot): void, currentTaskRunId: string | null }>();

  const savingPreference = ref(false);
  const preferenceError = ref('');
  const updateD1 = computed({
    get: () => snapshot.value?.config.searchStorage.updateD1 ?? true,
    set: async (value: boolean) => {
      savingPreference.value = true;
      preferenceError.value = '';
      try {
        await update('searchStorage.updateD1', value);
      } catch (cause) {
        preferenceError.value = settingsError(cause);
      } finally {
        savingPreference.value = false;
      }
    },
  });
  const direct = computed(() => selection.selected.value?.kind === 'direct');
  const taskType = computed(() => direct.value ? exportType : publishType);
  const task = computed(() => occupying.value ?? entries.value.find(entry => entry.taskType === taskType.value)?.task ?? null);
  const databaseConfigured = computed(() => Boolean(snapshot.value?.config.database?.trim()));
  const outputDirectory = computed(() => {
    const directory = task.value?.result?.directory;
    return typeof directory === 'string' ? directory : '';
  });
  const loggedIn = computed(() => remoteStatus.value?.loggedIn === true);
  const exportDirectory = computed(() => snapshot.value?.config.searchStorage.exportDirectory?.trim() ?? '');
  const error = computed(() => preferenceError.value || selection.error.value || launchError.value || (task.value?.pageSnapshot ? '' : task.value?.errorMessage ?? ''));
  const targetLocked = computed(() => savingPreference.value || busy.value || occupying.value !== null);
  const operations = computed<TaskOperation[]>(() => [{
    key:      taskType.value,
    label:    direct.value ? '导出 SQLite' : '发布',
    icon:     'i-lucide-database',
    disabled: targetLocked.value || !databaseConfigured.value || (!direct.value && !loggedIn.value)
      || selection.selected.value?.configured !== true || exportDirectory.value === '',
    create: start,
  }]);

  /** Launches the load after checking the requirements for the selected target. */
  async function start() {
    const target = selection.selected.value;
    if (target?.configured && (target.kind === 'direct' || await requireSession())) {
      await launch(target.kind === 'direct' ? exportType : publishType, {
        game,
        directory: exportDirectory.value,
        targetId:  target.id,
        updateD1:  updateD1.value,
      });
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

  return { ...selection, controller, error, direct, databaseConfigured, loggedIn, exportDirectory, outputDirectory, operations, targetLocked, updateD1 };
}
