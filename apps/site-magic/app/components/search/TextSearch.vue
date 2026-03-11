<template>
  <div class="flex items-center gap-2 min-w-0">
    <!-- Text input -->
    <UInput
      :model-value="modelValue.value"
      size="sm"
      class="flex-1 min-w-0"
      @update:model-value="v => emit('update:modelValue', { ...modelValue, value: String(v) })"
    />

    <!-- Modifier buttons (only for name / type / text) -->
    <template v-if="withModifier">
      <div class="flex text-xs rounded overflow-hidden ring-1 ring-gray-300 dark:ring-white/20 shrink-0">
        <button
          v-for="mod in MODIFIERS"
          :key="mod.value"
          class="px-2 py-1 transition text-gray-700 dark:text-white/80"
          :class="currentModifier === mod.value ? 'bg-gray-200 dark:bg-white/20' : 'hover:bg-gray-100 dark:hover:bg-white/10'"
          @click="setModifier(mod.value)"
        >
          {{ mod.label }}
        </button>
      </div>
    </template>

    <!-- NOT toggle -->
    <UButton
      :color="modelValue.negate ? 'error' : 'neutral'"
      :variant="modelValue.negate ? 'solid' : 'ghost'"
      size="sm"
      class="shrink-0"
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
      class="shrink-0 opacity-50 hover:opacity-100"
      @click="emit('update:modelValue', withModifier ? { value: '', modifier: 'default', negate: false } : { value: '', negate: false })"
    />
  </div>
</template>

<script setup lang="ts">
import type { TextFieldState, TextModifier, TextOnlyState } from '~/composables/advanced-search';

const props = defineProps<{
  modelValue:    TextFieldState | TextOnlyState;
  withModifier?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: TextFieldState | TextOnlyState];
}>();

const { t } = useI18n();

const currentModifier = computed(() =>
  (props.modelValue as TextFieldState).modifier ?? 'default',
);

const MODIFIERS = computed(() => [
  { value: 'default' as TextModifier, label: t('magic.search.advanced.modifier-default') },
  { value: 'oracle' as TextModifier, label: t('magic.search.advanced.modifier-oracle') },
  { value: 'unified' as TextModifier, label: t('magic.search.advanced.modifier-unified') },
  { value: 'printed' as TextModifier, label: t('magic.search.advanced.modifier-printed') },
]);

const setModifier = (mod: TextModifier) => {
  emit('update:modelValue', { ...props.modelValue, modifier: mod } as TextFieldState);
};
</script>
