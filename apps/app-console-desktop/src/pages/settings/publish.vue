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
  </SettingsFrame>
</template>
<script setup lang="ts">
import { useDesktopSettings, settingsError } from '~/composables/useDesktopSettings';
import type { Configuration } from '../../../shared/settings';
/** Incomplete new rows remain local until their required selections are complete. */
type Row = Omit<Configuration['publish'][number], 'publishTarget'> & { publishTarget: string };
definePageMeta({ layout: 'admin', title: '发布配置' });
const { snapshot, update, secret } = useDesktopSettings();
const rows = ref<Row[]>([]);
const busy = ref(false);
const error = ref('');
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
</script>
