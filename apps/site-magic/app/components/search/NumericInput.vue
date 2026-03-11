<template>
  <div class="flex items-center gap-2">
    <!-- Operator -->
    <USelect
      :model-value="modelValue.operator"
      :items="OPERATOR_ITEMS"
      size="sm"
      class="w-24"
      :ui="{ base: 'font-mono' }"
      @update:model-value="v => emit('update:modelValue', { ...modelValue, operator: v as NumericOperator })"
    />

    <!-- Number input -->
    <UInput
      :model-value="modelValue.value"
      size="sm"
      type="text"
      inputmode="decimal"
      class="w-24"
      :ui="{ base: 'font-mono' }"
      @update:model-value="v => emit('update:modelValue', { ...modelValue, value: String(v) })"
    />

    <!-- NOT toggle -->
    <UButton
      :color="modelValue.negate ? 'error' : 'neutral'"
      :variant="modelValue.negate ? 'solid' : 'ghost'"
      size="sm"
      :class="modelValue.negate ? '' : 'opacity-50 hover:opacity-80'"
      @click="emit('update:modelValue', { ...modelValue, negate: !modelValue.negate })"
    >
      {{ $t('magic.search.advanced.negate') }}
    </UButton>

    <!-- Clear button -->
    <UButton
      v-if="modelValue.value !== '' || modelValue.negate"
      icon="lucide:x"
      variant="ghost"
      size="sm"
      color="neutral"
      class="opacity-50 hover:opacity-100"
      @click="emit('update:modelValue', { value: '', operator: '=', negate: false })"
    />
  </div>
</template>

<script setup lang="ts">
import type { NumericFieldState, NumericOperator } from '~/composables/advanced-search';

defineProps<{
  modelValue: NumericFieldState;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: NumericFieldState];
}>();

const OPERATOR_ITEMS: { value: NumericOperator, label: string }[] = [
  { value: '=', label: '=' },
  { value: '>', label: '>' },
  { value: '>=', label: '>=' },
  { value: '<', label: '<' },
  { value: '<=', label: '<=' },
];
</script>
