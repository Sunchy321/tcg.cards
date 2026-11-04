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
          <h2 class="font-medium">搜索数据导出</h2>
          <p class="text-sm text-muted">导出的搜索数据会保存在此目录下。</p>
        </div>
      </template>
      <UAlert v-if="storageError" role="alert" color="error" :description="storageError" class="mb-4" />
      <div class="space-y-2">
        <label for="search-export-directory" class="block text-sm font-medium">导出目录</label>
        <div class="flex gap-2">
          <UInput
            id="search-export-directory"
            v-model="searchExportDirectory"
            autocomplete="off"
            placeholder="选择保存搜索数据的目录"
            :disabled="storageBusy"
            class="w-full"
          />
          <UButton label="选择目录" icon="i-lucide-folder-open" variant="soft" :disabled="storageBusy" @click="pickSearchDirectory" />
          <UButton label="保存" :loading="storageBusy" @click="saveSearchStorage" />
        </div>
      </div>
    </UCard>
  </SettingsFrame>
</template>
<script setup lang="ts">
import { useDesktopSettings, settingsError } from '~/composables/useDesktopSettings';
/** One editable destination row before its name is complete. */
type TargetRow = { id: string, name: string, kind: 'direct' | 'account', connectionString: string };
definePageMeta({ layout: 'admin', title: '发布配置' });
const { snapshot, update } = useDesktopSettings();
const rows = ref<TargetRow[]>([]);
const busy = ref(false);
const error = ref('');
const targetKinds = [
  { label: '直连', value: 'direct' },
  { label: '账户', value: 'account' },
];
/** Persisted targets, safe while the main process is still on an older settings shape. */
const savedTargets = computed(() => snapshot.value?.config.targets ?? []);
const searchExportDirectory = ref('');
const storageBusy = ref(false);
const storageError = ref('');
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
/** Saves the export directory independently of the other search settings. */
async function saveSearchStorage() {
  storageBusy.value = true;
  storageError.value = '';
  try {
    await update('searchStorage.exportDirectory', searchExportDirectory.value.trim());
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
</script>
