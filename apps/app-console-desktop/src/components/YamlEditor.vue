<template>
  <SharedYamlEditor
    :model-value="modelValue"
    :error="error"
    @update:model-value="emit('update:modelValue', $event)"
  />
</template>

<script setup lang="ts">
import { YamlEditor as SharedYamlEditor } from '@tcg-cards/console-ui';

defineProps<{
  modelValue: string;
  error?: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();
</script>
