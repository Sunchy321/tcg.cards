<template>
  <SettingsFrame title="发布配置">
    <UCard>
      <template #header>
        <div class="flex items-center justify-between gap-3">
          <h2 class="font-medium">发布连接</h2>
          <UButton label="添加连接" icon="i-lucide-plus" variant="soft" @click="add" />
        </div>
      </template>
      <UAlert v-if="error" role="alert" color="error" :description="error" class="mb-4" />
      <p v-if="!rows.length" class="text-sm text-muted">暂无发布连接。</p>
      <div v-for="row in rows" :key="row.credentialKey" class="mb-5 space-y-4 rounded-lg border border-default p-4">
        <div class="grid gap-4 sm:grid-cols-2">
          <div class="space-y-2">
            <label :for="`game-${row.credentialKey}`" class="block text-sm font-medium">游戏</label>
            <USelect
              :id="`game-${row.credentialKey}`"
              v-model="row.publishTarget"
              :items="games"
              placeholder="选择游戏"
              :disabled="busy"
              class="w-full"
              @update:model-value="persist"
            />
          </div>
          <div class="space-y-2">
            <label :for="`environment-${row.credentialKey}`" class="block text-sm font-medium">环境</label>
            <USelect
              :id="`environment-${row.credentialKey}`"
              v-model="row.environment"
              :items="environments"
              placeholder="选择环境"
              :disabled="busy"
              class="w-full"
              @update:model-value="persist"
            />
          </div>
        </div>
        <SettingField
          v-if="isSaved(row.credentialKey)"
          label="连接字符串"
          secret
          :configured="snapshot?.credentials[`publish:${row.credentialKey}`]"
          :save="value => secret(`publish:${row.credentialKey}`, value)"
        />
        <p v-else class="text-sm text-muted">选择游戏和环境后，即可填写连接字符串。</p>
        <UButton
          label="删除连接"
          icon="i-lucide-trash"
          color="error"
          variant="ghost"
          :disabled="busy"
          @click="remove(row.credentialKey)"
        />
      </div>
    </UCard>
    <UCard>
      <template #header>
        <div class="space-y-1">
          <h2 class="font-medium">搜索数据存储</h2>
          <p class="text-sm text-muted">设置用于发布搜索数据的 Cloudflare R2 连接。</p>
          <p class="text-sm text-muted">请使用仅能访问搜索数据存储的密钥。</p>
        </div>
      </template>
      <UAlert v-if="storageError" role="alert" color="error" :description="storageError" class="mb-4" />
      <div class="mb-4 space-y-2">
        <label for="search-r2-account" class="block text-sm font-medium">Cloudflare 账户 ID</label>
        <div class="flex gap-2">
          <UInput
            id="search-r2-account"
            v-model="searchR2AccountId"
            autocomplete="off"
            :disabled="storageBusy"
            class="w-full"
          />
          <UButton label="保存" :loading="storageBusy" @click="saveSearchR2Account" />
        </div>
      </div>
      <div class="grid gap-4 sm:grid-cols-2">
        <SettingField
          label="访问密钥 ID"
          secret
          :configured="snapshot?.credentials['search-r2-access-key-id']"
          :save="value => secret('search-r2-access-key-id', value)"
        />
        <SettingField
          label="访问密钥"
          secret
          :configured="snapshot?.credentials['search-r2-secret-access-key']"
          :save="value => secret('search-r2-secret-access-key', value)"
        />
      </div>
      <p class="mt-3 text-xs text-muted">访问密钥由此设备的系统安全存储保护。</p>
    </UCard>
    <UCard>
      <template #header>
        <div class="space-y-1">
          <h2 class="font-medium">发布搜索数据</h2>
          <p class="text-sm text-muted">选择包含该游戏基础包和语言包的导出目录。</p>
        </div>
      </template>
      <UAlert v-if="publicationError" role="alert" color="error" :description="publicationError" class="mb-4" />
      <div class="space-y-4">
        <UFormField label="游戏">
        <USelect v-model="searchGame" :items="searchGames" :disabled="publicationBusy" class="w-full" />
        </UFormField>
        <UFormField label="导出目录">
          <div class="flex gap-2">
            <UInput :model-value="searchDirectory" readonly class="w-full" placeholder="选择搜索数据导出目录" />
            <UButton label="选择目录" icon="i-lucide-folder-open" variant="soft" :disabled="publicationBusy" @click="pickSearchDirectory" />
          </div>
        </UFormField>
        <TaskItem v-if="selectedPublicationTask" :task="selectedPublicationTask" />
        <div class="flex flex-wrap gap-2">
          <UButton
            v-if="!selectedPublicationTask || isTaskTerminal(selectedPublicationTask)"
            label="发布搜索数据"
            icon="i-lucide-cloud-upload"
            :loading="publicationBusy"
            :disabled="!canPublishSearchPackages || !searchDirectory.trim()"
            @click="publishSearchPackages"
          />
          <UButton
            v-if="selectedPublicationTask && ['failed', 'canceled', 'abandoned'].includes(selectedPublicationTask.status)"
            label="重试"
            variant="soft"
            :loading="publicationBusy"
            @click="retryPublication(selectedPublicationTask)"
          />
          <UButton
            v-if="selectedPublicationTask && ['pending', 'running', 'pausing', 'paused', 'resuming', 'interrupted'].includes(selectedPublicationTask.status)"
            label="取消"
            color="error"
            variant="soft"
            :loading="publicationBusy"
            @click="cancelPublication(selectedPublicationTask)"
          />
        </div>
        <p v-if="!canPublishSearchPackages" class="text-sm text-muted">请先填写账户 ID 和访问密钥。</p>
      </div>
    </UCard>
  </SettingsFrame>
</template>
<script setup lang="ts">
import { useDesktopSettings, settingsError } from '~/composables/useDesktopSettings';
import type { TaskView } from '../../../electron/contract';
import type { Configuration } from '../../../shared/settings';
/** Incomplete new rows remain local until their required selections are complete. */
type Row = Omit<Configuration['publish'][number], 'publishTarget'> & { publishTarget: string };
definePageMeta({ layout: 'admin', title: '发布配置' });
const { snapshot, update, secret } = useDesktopSettings();
const {
  entries: publicationEntries,
  error:   publicationError,
  busy:    publicationBusy,
  launch:  launchPublication,
  retry:   retrySearchPublication,
  control: controlPublication,
} = useTaskControl([
  { taskType: 'magic_search_package_publish', label: '万智牌搜索数据发布' },
  { taskType: 'hearthstone_search_package_publish', label: '炉石传说搜索数据发布' },
]);
const rows = ref<Row[]>([]);
const busy = ref(false);
const error = ref('');
const searchR2AccountId = ref('');
const storageBusy = ref(false);
const storageError = ref('');
const searchGame = ref<'magic' | 'hearthstone'>('magic');
const searchDirectory = ref('');
const searchGames = [
  { label: '万智牌', value: 'magic' },
  { label: '炉石传说', value: 'hearthstone' },
];
const publicationTaskType = computed(() => `${searchGame.value}_search_package_publish`);
const selectedPublicationTask = computed(() => publicationEntries.value
  .find(entry => entry.taskType === publicationTaskType.value)?.task ?? null);
const canPublishSearchPackages = computed(() => snapshot.value?.config.searchStorage.accountId != null
  && snapshot.value?.credentials['search-r2-access-key-id'] === true
  && snapshot.value?.credentials['search-r2-secret-access-key'] === true);
const games = [
  { label: '炉石传说', value: 'hearthstone' },
  { label: '万智牌', value: 'magic' },
  { label: '游戏王', value: 'yugioh' },
];
const environments = [
  { label: '开发环境', value: 'dev' },
  { label: '生产环境', value: 'prod' },
];
watch(
  () => snapshot.value?.config.publish,
  value => {
    if (!rows.value.length && value?.length) rows.value = structuredClone(toRaw(value));
  },
  { immediate: true },
);
watch(
  () => snapshot.value?.config.searchStorage.accountId,
  value => {
    if (value != null) searchR2AccountId.value = value;
  },
  { immediate: true },
);
/** Identifies persisted rows before allowing their credentials to be edited. */
function isSaved(key: string) {
  return snapshot.value?.config.publish.some(row => row.credentialKey === key) ?? false;
}
/** Creates an empty local row without writing invalid settings. */
function add() {
  rows.value.push({ credentialKey: crypto.randomUUID(), publishTarget: '', environment: '' });
}
/** Applies complete selections immediately without dropping another incomplete draft row. */
async function persist() {
  busy.value = true;
  error.value = '';
  try {
    await update(
      'publish',
      rows.value
        .filter(row => row.publishTarget && row.environment)
        .map(row => {
          const saved = snapshot.value?.config.publish.find(item => item.credentialKey === row.credentialKey);
          // A credential edit can invalidate verification while this page retains its row drafts.
          const targetFingerprint
            = saved?.publishTarget === row.publishTarget && saved?.environment === row.environment
              ? saved.targetFingerprint
              : undefined;
          return { ...row, targetFingerprint };
        }),
    );
  } catch (cause) {
    error.value = settingsError(cause);
  } finally {
    busy.value = false;
  }
}
/** Removes a local profile while JSON and credential persistence remain separate. */
async function remove(key: string) {
  const before = [...rows.value];
  rows.value = rows.value.filter(row => row.credentialKey !== key);
  await persist();
  if (error.value) rows.value = before;
}
/** Saves the public account identifier separately from encrypted access keys. */
async function saveSearchR2Account() {
  storageBusy.value = true;
  storageError.value = '';
  try {
    await update('searchStorage', { accountId: searchR2AccountId.value.trim() || undefined });
  } catch (cause) {
    storageError.value = settingsError(cause);
  } finally {
    storageBusy.value = false;
  }
}
/** Opens a native directory picker for the completed local search export. */
async function pickSearchDirectory() {
  try {
    searchDirectory.value = await window.desktop.settings.pickDirectory(searchDirectory.value || null) ?? searchDirectory.value;
  } catch (cause) {
    publicationError.value = settingsError(cause);
  }
}
/** Starts the selected game's publication task with the chosen completed export. */
async function publishSearchPackages() {
  await launchPublication(publicationTaskType.value, {
    game:      searchGame.value,
    directory: searchDirectory.value,
  });
}
/** Retries the selected game's last failed search publication. */
async function retryPublication(task: TaskView) {
  await retrySearchPublication(task);
}
/** Stops a package publication between safe transfer boundaries. */
async function cancelPublication(task: TaskView) {
  await controlPublication(task, 'cancel');
}
/** Keeps completed runs available for inspection while allowing another release. */
function isTaskTerminal(task: TaskView) {
  return ['completed', 'failed', 'canceled', 'abandoned'].includes(task.status);
}
</script>
