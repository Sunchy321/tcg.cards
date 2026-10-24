<template>
  <SettingsFrame title="高级 JSON">
    <UCard>
      <div class="space-y-4">
        <div class="flex gap-2">
          <UButton label="保存" icon="i-lucide-save" :loading="saving" :disabled="!dirty || saving" @click="void save()" />
          <UButton label="格式化" icon="i-lucide-braces" color="neutral" variant="soft" :disabled="saving" @click="format" />
          <UButton label="重新加载" icon="i-lucide-rotate-ccw" color="neutral" variant="ghost" :disabled="saving" @click="reload" />
          <span v-if="dirty" class="self-center text-xs text-muted">有未保存的修改</span>
        </div>
        <UAlert role="alert" v-if="error" color="error" :description="error" />
        <p v-if="saved" role="status" class="text-sm text-success">已保存。</p>
        <MonacoJsonEditor v-if="loaded" v-model="text" :schema="jsonSchema" :disabled="saving" />
      </div>
    </UCard>
    <UModal v-model:open="confirmOpen" title="保存修改？" description="还有未保存的配置修改。" :dismissible="false">
      <template #body><UAlert role="alert" v-if="error" color="error" :description="error" /></template>
      <template #footer>
        <div class="flex w-full flex-wrap justify-end gap-2">
          <UButton label="继续编辑" color="neutral" variant="ghost" :disabled="saving" @click="choose('cancel')" />
          <UButton label="放弃修改" color="neutral" variant="soft" :disabled="saving" @click="choose('discard')" />
          <UButton label="保存并离开" :loading="saving" @click="choose('save')" />
        </div>
      </template>
    </UModal>
  </SettingsFrame>
</template>
<script setup lang="ts">
import { z } from 'zod';
import { configuration, parseConfiguration } from '../../../shared/settings';
import { useDesktopSettings, settingsError } from '~/composables/useDesktopSettings';
definePageMeta({ layout: 'admin', title: '高级 JSON' });
const { snapshot, bridge } = useDesktopSettings();
const jsonSchema = z.toJSONSchema(configuration);
const text = ref('');
const baseline = ref('');
const revision = ref(0);
const loaded = ref(false);
const saving = ref(false);
const saved = ref(false);
const error = ref('');
const confirmOpen = ref(false);
const dirty = computed(() => text.value !== baseline.value);
let pending: ((choice: 'save' | 'discard' | 'cancel') => void) | undefined;
let allowUnload = false;
let unsubscribe: (() => void) | undefined;
/** Reads the whole ordinary document without exposing encrypted storage or secrets. */
async function load() {
  try {
    snapshot.value = await bridge.read();
    text.value = JSON.stringify(snapshot.value.config, null, 2);
    baseline.value = text.value;
    revision.value = snapshot.value.revision;
    loaded.value = true;
    error.value = '';
  } catch (cause) { error.value = settingsError(cause); }
}
/** Persists only a completely valid document and retains text when persistence fails. */
async function save() {
  saving.value = true;
  error.value = '';
  saved.value = false;
  try {
    parseConfiguration(text.value);
    snapshot.value = await bridge.saveJson(text.value, revision.value);
    text.value = JSON.stringify(snapshot.value.config, null, 2);
    baseline.value = text.value;
    revision.value = snapshot.value.revision;
    await bridge.setDirty(false);
    saved.value = true;
    return true;
  } catch (cause) { error.value = settingsError(cause); return false; }
  finally { saving.value = false; }
}
/** Formats a valid draft without saving it. */
function format() {
  try { text.value = JSON.stringify(parseConfiguration(text.value), null, 2); error.value = ''; }
  catch (cause) { error.value = settingsError(cause); }
}
/** Opens one shared three-choice prompt for navigation, reload and native close. */
function confirm(): Promise<'save' | 'discard' | 'cancel'> {
  if (pending) return Promise.resolve('cancel');
  confirmOpen.value = true;
  return new Promise(resolve => { pending = resolve; });
}
/** Leaves the prompt open on failed validation so the draft is never silently discarded. */
async function choose(choice: 'save' | 'discard' | 'cancel') {
  if (choice === 'save' && !await save()) return;
  confirmOpen.value = false;
  const resolve = pending;
  pending = undefined;
  resolve?.(choice);
}
/** Confirms before a reload can discard a draft. */
async function reload() {
  if (dirty.value && await confirm() === 'cancel') return;
  await load();
}
watch(dirty, value => { void bridge.setDirty(value).catch(cause => { error.value = settingsError(cause); }); }, { flush: 'sync' });
watch(text, () => { saved.value = false; });
onBeforeRouteLeave(async () => {
  if (!dirty.value) return true;
  const choice = await confirm();
  if (choice === 'cancel') return false;
  await bridge.setDirty(false);
  return true;
});
/** Covers native reloads and the narrow interval before the dirty IPC reaches main. */
function beforeUnload(event: BeforeUnloadEvent) {
  if (!dirty.value || allowUnload) return;
  event.preventDefault();
  event.returnValue = 'unsaved';
}
onMounted(async () => {
  window.addEventListener('beforeunload', beforeUnload);
  unsubscribe = bridge.onCloseRequested(async () => {
    const choice = dirty.value ? await confirm() : 'discard';
    if (choice !== 'cancel') allowUnload = true;
    await bridge.resolveClose(choice);
  });
  await load();
});
onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', beforeUnload);
  unsubscribe?.();
  pending?.('cancel');
});
</script>
