<template>
  <div class="space-y-2">
    <label class="text-sm font-medium text-default">
      {{ label }}<span v-if="required" class="text-destructive"> *</span>
    </label>
    <USelect
      :model-value="modelValue"
      :items="files"
      :disabled="disabled"
      placeholder="选择文件"
      class="w-full"
      @update:model-value="v => emit('update:modelValue', (v as string) ?? '')"
    />
  </div>
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
</script>
