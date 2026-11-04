<template>
  <SettingsFrame title="发布配置">
    <UCard>
      <template #header>
        <div class="flex items-center justify-between gap-3">
          <div class="space-y-1">
            <h2 class="font-medium">发布目标</h2>
            <p class="text-sm text-muted">每次发布时在发布页右上角选择一个目标。</p>
          </div>
          <UButton label="添加目标" icon="i-lucide-plus" variant="soft" @click="add" />
        </div>
      </template>
      <UAlert v-if="error" role="alert" color="error" :description="error" class="mb-4" />
      <p v-if="!rows.length" class="text-sm text-muted">暂无发布目标。</p>
      <div v-for="row in rows" :key="row.id" class="mb-5 space-y-4 rounded-lg border border-default p-4">
        <div class="grid gap-4 sm:grid-cols-2">
          <div class="space-y-2">
            <label :for="`target-name-${row.id}`" class="block text-sm font-medium">名称</label>
            <UInput
              :id="`target-name-${row.id}`"
              v-model="row.name"
              placeholder="例如：本地、线上"
              :disabled="busy"
              class="w-full"
              @blur="persist"
            />
          </div>
          <div class="space-y-2">
            <label :for="`target-kind-${row.id}`" class="block text-sm font-medium">类型</label>
            <USelect
              :id="`target-kind-${row.id}`"
              v-model="row.kind"
              :items="targetKinds"
              :disabled="busy"
              class="w-full"
              @update:model-value="persist"
            />
          </div>
        </div>
        <div v-if="row.kind === 'direct'" class="space-y-2">
          <label :for="`target-connection-${row.id}`" class="block text-sm font-medium">连接字符串</label>
          <UInput
            :id="`target-connection-${row.id}`"
            v-model="row.connectionString"
            placeholder="postgres://user:password@localhost/database"
            :disabled="busy"
            class="w-full"
            @blur="persist"
          />
        </div>
        <p v-else class="text-sm text-muted">
          {{ snapshot?.credentials['remote-session'] ? '已登录：发布时由服务校验权限并签发临时凭据。' : '账户目标需要先在「远端登录」中登录。' }}
        </p>
        <UButton
          label="删除目标"
          icon="i-lucide-trash"
          color="error"
          variant="ghost"
          :disabled="busy"
          @click="remove(row.id)"
        />
      </div>
    </UCard>
    <UCard>
      <template #header>
        <div class="space-y-1">
          <h2 class="font-medium">搜索数据存储</h2>
          <p class="text-sm text-muted">设置用于发布搜索数据的 Cloudflare R2 连接和搜索数据导出目录。</p>
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
          <UButton label="保存" :loading="storageBusy" @click="saveSearchStorage" />
        </div>
      </div>
      <div class="mb-4 space-y-2">
        <label for="search-export-directory" class="block text-sm font-medium">搜索数据导出目录</label>
        <div class="flex gap-2">
          <UInput
            id="search-export-directory"
            v-model="searchExportDirectory"
            autocomplete="off"
            placeholder="选择包含基础包和语言包的导出目录"
            :disabled="storageBusy"
            class="w-full"
          />
          <UButton label="选择目录" icon="i-lucide-folder-open" variant="soft" :disabled="storageBusy" @click="pickSearchDirectory" />
          <UButton label="保存" :loading="storageBusy" @click="saveSearchStorage" />
        </div>
        <p class="text-xs text-muted">游戏数据发布页与搜索数据发布都使用这个目录。</p>
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
          <h2 class="font-medium">发布搜索数据包</h2>
          <p class="text-sm text-muted">把导出目录中的搜索数据包上传到搜索数据存储，供桌面端下载使用。</p>
        </div>
      </template>
      <UAlert v-if="publicationError" role="alert" color="error" :description="publicationError" class="mb-4" />
      <div class="space-y-4">
        <UFormField label="游戏">
        <USelect v-model="searchGame" :items="searchGames" :disabled="publicationBusy" class="w-full" />
        </UFormField>
        <UFormField label="导出目录">
          <UInput :model-value="searchDirectory" readonly class="w-full" placeholder="未配置，请在上方的搜索数据存储中设置" />
        </UFormField>
        <TaskItem v-if="selectedPublicationTask" :task="selectedPublicationTask" />
        <div class="flex flex-wrap gap-2">
          <UButton
            v-if="!selectedPublicationTask || isTaskTerminal(selectedPublicationTask)"
            label="发布搜索数据包"
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
        <p v-else-if="!searchDirectory.trim()" class="text-sm text-muted">请先在上方的搜索数据存储中配置导出目录。</p>
      </div>
    </UCard>
  </SettingsFrame>
</template>
<script setup lang="ts">
import { useDesktopSettings, settingsError } from '~/composables/useDesktopSettings';
import type { TaskView } from '../../../electron/contract';
/** One editable destination row before its name is complete. */
type TargetRow = { id: string, name: string, kind: 'direct' | 'account', connectionString: string };
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
const rows = ref<TargetRow[]>([]);
const busy = ref(false);
const error = ref('');
const targetKinds = [
  { label: '直连', value: 'direct' },
  { label: '账户', value: 'account' },
];
/** Persisted targets, safe while the main process is still on an older settings shape. */
const savedTargets = computed(() => snapshot.value?.config.targets ?? []);
const searchR2AccountId = ref('');
const searchExportDirectory = ref('');
const storageBusy = ref(false);
const storageError = ref('');
const searchGame = ref<'magic' | 'hearthstone'>('magic');
const searchGames = [
  { label: '万智牌', value: 'magic' },
  { label: '炉石传说', value: 'hearthstone' },
];
const publicationTaskType = computed(() => `${searchGame.value}_search_package_publish`);
const selectedPublicationTask = computed(() => publicationEntries.value
  .find(entry => entry.taskType === publicationTaskType.value)?.task ?? null);
const searchDirectory = computed(() => snapshot.value?.config.searchStorage.exportDirectory?.trim() ?? '');
const canPublishSearchPackages = computed(() => snapshot.value?.config.searchStorage.accountId != null
  && snapshot.value?.credentials['search-r2-access-key-id'] === true
  && snapshot.value?.credentials['search-r2-secret-access-key'] === true);
watch(
  () => snapshot.value?.config.targets,
  value => {
    if (!rows.value.length && value?.length) {
      rows.value = value.map(target => ({
        id:               target.id,
        name:             target.name,
        kind:             target.kind,
        connectionString: target.connectionString ?? '',
      }));
    }
  },
  { immediate: true },
);
watch(
  () => snapshot.value?.config.searchStorage,
  value => {
    if (value?.accountId != null) searchR2AccountId.value = value.accountId;
    searchExportDirectory.value = value?.exportDirectory ?? '';
  },
  { immediate: true },
);
/** Creates an empty local row without writing invalid settings. */
function add() {
  rows.value.push({ id: crypto.randomUUID(), name: '', kind: 'direct', connectionString: '' });
}
/** Applies complete names immediately without dropping another incomplete draft row. */
async function persist() {
  busy.value = true;
  error.value = '';
  try {
    await update(
      'targets',
      rows.value
        .filter(row => row.name.trim())
        .map(row => {
          const saved = savedTargets.value.find(item => item.id === row.id);
          const connectionString = row.connectionString.trim();
          // A different name, kind or connection is a different destination and cannot keep its verification.
          const verified = saved?.name === row.name.trim()
            && saved.kind === row.kind
            && saved.connectionString === (connectionString || undefined)
            ? saved?.targetFingerprint
            : undefined;
          return {
            id:   row.id,
            name: row.name.trim(),
            kind: row.kind,
            ...(connectionString ? { connectionString } : {}),
            ...(verified ? { targetFingerprint: verified } : {}),
          };
        }),
    );
  } catch (cause) {
    error.value = settingsError(cause);
  } finally {
    busy.value = false;
  }
}
/** Removes a local target while JSON and credential persistence remain separate. */
async function remove(id: string) {
  const before = [...rows.value];
  rows.value = rows.value.filter(row => row.id !== id);
  await persist();
  if (error.value) {
    rows.value = before;
    return;
  }
  try {
    const selection = { ...snapshot.value?.config.targetSelection };
    for (const game of Object.keys(selection) as Array<keyof typeof selection>) {
      if (selection[game] === id) Reflect.deleteProperty(selection, game);
    }
    await update('targetSelection', selection);
  } catch (cause) {
    error.value = settingsError(cause);
  }
}
/** Saves the storage identity and export directory as one configuration replacement. */
async function saveSearchStorage() {
  storageBusy.value = true;
  storageError.value = '';
  try {
    await update('searchStorage', {
      accountId:       searchR2AccountId.value.trim() || undefined,
      exportDirectory: searchExportDirectory.value.trim() || undefined,
    });
  } catch (cause) {
    storageError.value = settingsError(cause);
  } finally {
    storageBusy.value = false;
  }
}
/** Opens a native directory picker for the completed local search export. */
async function pickSearchDirectory() {
  try {
    searchExportDirectory.value = await window.desktop.settings.pickDirectory(searchExportDirectory.value || null) ?? searchExportDirectory.value;
  } catch (cause) {
    storageError.value = settingsError(cause);
  }
}
/** Starts the selected game's package publication with the configured export. */
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
