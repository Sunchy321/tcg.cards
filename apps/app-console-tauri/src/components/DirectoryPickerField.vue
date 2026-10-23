<template>
  <div class="flex flex-col gap-3 xl:flex-row">
    <UInput
      class="flex-1"
      :model-value="displayValue"
      :placeholder="placeholder"
      :readonly="readonly"
      :loading="loading"
      :disabled="disabled"
    />
    <div class="flex flex-wrap gap-2">
      <UButton
        :label="pickLabel"
        icon="i-lucide-folder-open"
        color="neutral"
        variant="soft"
        :loading="pickLoading"
        :disabled="pickDisabled"
        @click="$emit('pick')"
      />
      <UButton
        :label="clearLabel"
        icon="i-lucide-eraser"
        color="neutral"
        variant="ghost"
        :disabled="resolvedClearDisabled"
        @click="$emit('clear')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{
  value?:         string | null;
  placeholder?:   string;
  readonly?:      boolean;
  loading?:       boolean;
  disabled?:      boolean;
  pickLoading?:   boolean;
  pickDisabled?:  boolean;
  clearDisabled?: boolean;
  pickLabel?:     string;
  clearLabel?:    string;
}>(), {
  value:         '',
  placeholder:   '/absolute/path/to/directory',
  readonly:      true,
  loading:       false,
  disabled:      false,
  pickLoading:   false,
  pickDisabled:  false,
  clearDisabled: false,
  pickLabel:     '选择目录',
  clearLabel:    '清空',
});

defineEmits<{
  pick:  [];
  clear: [];
}>();

const displayValue = computed(() => props.value ?? '');
const hasValue = computed(() => displayValue.value.trim().length > 0);

const resolvedClearDisabled = computed(() => {
  return props.clearDisabled || !hasValue.value;
});
</script>
