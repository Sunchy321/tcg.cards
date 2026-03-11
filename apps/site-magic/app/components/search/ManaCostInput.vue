<template>
  <div class="flex flex-col gap-2">
    <!-- Input row -->
    <div class="flex items-center gap-2">
      <UInput
        :model-value="modelValue.value"
        size="sm"
        placeholder="{2}{W}{U}"
        class="flex-1 font-mono"
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
        @click="emit('update:modelValue', { value: '', negate: false })"
      />
    </div>

    <!-- Symbol quick-insert buttons -->
    <div class="flex flex-wrap gap-1">
      <button
        v-for="sym in QUICK_SYMBOLS"
        :key="sym"
        class="px-1.5 py-0.5 rounded text-sm bg-gray-100 hover:bg-gray-200 dark:bg-white/10 dark:hover:bg-white/20 text-gray-700 dark:text-white/80 transition"
        @click="insertSymbol(sym)"
      >
        <Symbol :value="sym" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { TextOnlyState } from '~/composables/advanced-search';

const props = defineProps<{
  modelValue: TextOnlyState;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: TextOnlyState];
}>();

const QUICK_SYMBOLS = [
  '{W}', '{U}', '{B}', '{R}', '{G}', '{C}',
  '{X}', '{0}', '{1}', '{2}', '{3}', '{4}', '{5}',
  '{W/U}', '{W/B}', '{U/B}', '{U/R}', '{B/R}', '{B/G}',
  '{R/W}', '{R/G}', '{G/W}', '{G/U}',
];

const insertSymbol = (sym: string) => {
  emit('update:modelValue', { ...props.modelValue, value: props.modelValue.value + sym });
};
</script>
