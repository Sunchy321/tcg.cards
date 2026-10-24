<template>
  <div class="space-y-2">
    <label :for="id" class="block text-sm font-medium">{{ label }}</label>
    <div class="flex items-start gap-2">
      <input
        :id="id"
        v-model="draft"
        :type="secret ? 'password' : 'text'"
        :placeholder="secret && configured ? '已保存，输入新值可替换' : placeholder"
        :disabled="loading || busy"
        :autocomplete="secret ? 'new-password' : 'off'"
        class="min-w-0 flex-1 rounded-lg border border-default bg-default px-3 py-2 text-sm"
        @blur="persist"
        @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
      >
      <UButton
        v-if="directory"
        label="选择目录"
        icon="i-lucide-folder-open"
        color="neutral"
        variant="soft"
        :disabled="loading || busy"
        @click="pick"
      />
      <UButton
        v-if="value || configured"
        label="清除"
        icon="i-lucide-x"
        color="neutral"
        variant="ghost"
        :disabled="loading || busy"
        @click="clear"
      />
    </div>
    <p v-if="error" role="alert" class="text-sm text-error">{{ error }}</p>
    <p v-else-if="busy" role="status" class="text-xs text-muted">正在保存…</p>
    <p v-else-if="saved" role="status" class="text-xs text-muted">已保存</p>
  </div>
</template>

<script setup lang="ts">
import { settingsError } from '~/composables/useDesktopSettings';

const props = defineProps<{
  label:        string;
  value?:       string;
  placeholder?: string;
  secret?:      boolean;
  configured?:  boolean;
  directory?:   boolean;
  loading?:     boolean;
  save:         (value: string | null) => Promise<void>;
}>();
const id = useId();
const draft = ref(props.value ?? '');
const baseline = ref(props.value ?? '');
const busy = ref(false);
const error = ref('');
const saved = ref(false);
watch(
  () => props.value,
  value => {
    const next = value ?? '';
    if (draft.value === baseline.value) draft.value = next;
    baseline.value = next;
  },
);
/** Commits a completed edit once; rejected values remain editable without changing storage. */
async function persist() {
  if (busy.value || draft.value === baseline.value) return;
  await commit(draft.value.trim() || null);
}
/** Saves one field and waits for persistence before showing success. */
async function commit(value: string | null) {
  busy.value = true;
  error.value = '';
  saved.value = false;
  try {
    await props.save(value);
    baseline.value = props.secret ? '' : (value ?? '');
    draft.value = baseline.value;
    saved.value = true;
  } catch (cause) {
    error.value = settingsError(cause);
  } finally {
    busy.value = false;
  }
}
/** Uses a native folder dialog; cancellation preserves the current value. */
async function pick() {
  try {
    const selected = await window.desktop.settings.pickDirectory(draft.value || props.placeholder || null);
    if (selected !== null) await commit(selected);
  } catch (cause) {
    error.value = settingsError(cause);
  }
}
/** Explicit clearing also works for write-only credentials with an empty input. */
async function clear() {
  await commit(null);
}
</script>
