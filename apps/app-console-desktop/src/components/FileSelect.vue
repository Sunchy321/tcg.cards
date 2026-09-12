<template>
  <UFormField
    :label="label"
    :required="required"
    orientation="horizontal"
    :ui="formFieldUi"
  >
    <USelect
      :model-value="modelValue"
      :items="files"
      :disabled="disabled"
      placeholder="选择文件"
      class="w-full"
      @update:model-value="v => emit('update:modelValue', (v as string) ?? '')"
    />
  </UFormField>
</template>

<script setup lang="ts">
defineProps<{
  label:      string;
  files:      { label: string, value: string }[];
  modelValue: string;
  disabled?:  boolean;
  required?:  boolean;
}>();

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

/** Horizontal form field: label next to the control with a small gap, control fills the rest. */
const formFieldUi = { root: 'flex items-center gap-3', container: 'relative flex-1' };
</script>
