<template>
  <div class="flex flex-wrap items-center gap-2">
    <!-- All color toggle buttons: WUBRG + C + M -->
    <div class="flex gap-1">
      <!-- WUBRG + C -->
      <button
        v-for="c in COLORS"
        :key="c.char"
        class="w-8 h-8 rounded-full flex items-center justify-center text-lg transition ring-2"
        :class="isSelected(c.char)
          ? 'ring-gray-600 dark:ring-white opacity-100'
          : 'ring-transparent opacity-40 hover:opacity-70'"
        :title="c.char"
        @click="toggleNormal(c.char)"
      >
        <Symbol :value="`{${c.char}}`" />
      </button>

      <!-- C (colorless) -->
      <button
        class="w-8 h-8 rounded-full flex items-center justify-center text-lg transition ring-2"
        :class="isSelected('C')
          ? 'ring-gray-600 dark:ring-white opacity-100'
          : 'ring-transparent opacity-40 hover:opacity-70'"
        :title="$t('magic.search.advanced.color-colorless')"
        @click="toggleSpecial('C')"
      >
        <Symbol value="{C}" />
      </button>

      <!-- M (multicolor) — gold circle icon -->
      <button
        class="w-8 h-8 rounded-full flex items-center justify-center transition ring-2"
        :class="isSelected('M')
          ? 'ring-gray-600 dark:ring-white opacity-100'
          : 'ring-transparent opacity-40 hover:opacity-70'"
        :title="$t('magic.search.advanced.color-multicolor')"
        @click="toggleSpecial('M')"
      >
        <div class="w-5 h-5 rounded-full" style="background: radial-gradient(circle at 35% 35%, #ffe066, #c8960c 60%, #7a5800)" />
      </button>
    </div>

    <!-- Operator selector — locked to `:` when C or M is selected -->
    <USelect
      :model-value="effectiveOperator"
      :items="OPERATOR_ITEMS"
      :disabled="isExclusive"
      size="sm"
      class="w-32"
      @update:model-value="v => emit('update:modelValue', { ...modelValue, operator: v as ColorOperator })"
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
      v-if="modelValue.values.length > 0 || modelValue.negate"
      icon="lucide:x"
      variant="ghost"
      size="sm"
      color="neutral"
      class="opacity-50 hover:opacity-100"
      @click="emit('update:modelValue', { values: [], operator: ':', negate: false })"
    />
  </div>
</template>

<script setup lang="ts">
import type { ColorFieldState, ColorOperator } from '~/composables/advanced-search';

const props = defineProps<{
  modelValue: ColorFieldState;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: ColorFieldState];
}>();

const { t } = useI18n();

const COLORS = [
  { char: 'W' },
  { char: 'U' },
  { char: 'B' },
  { char: 'R' },
  { char: 'G' },
] as const;

const OPERATOR_ITEMS = computed(() => [
  { value: ':', label: t('magic.search.advanced.color-op-include') },
  { value: '=', label: t('magic.search.advanced.color-op-exact') },
  { value: '>=', label: t('magic.search.advanced.color-op-least') },
  { value: '<=', label: t('magic.search.advanced.color-op-subset') },
]);

const isSelected = (char: string) => props.modelValue.values.includes(char);

/** C or M is selected — only `:` makes sense */
const isExclusive = computed(() =>
  props.modelValue.values.some(v => v === 'C' || v === 'M'),
);

const effectiveOperator = computed(() =>
  isExclusive.value ? ':' : props.modelValue.operator,
);

/** Toggle a normal color (WUBRG): clears C/M if present */
const toggleNormal = (char: string) => {
  const current = props.modelValue.values.filter(v => v !== 'C' && v !== 'M');
  const idx = current.indexOf(char);
  if (idx >= 0) {
    current.splice(idx, 1);
  } else {
    current.push(char);
  }
  emit('update:modelValue', { ...props.modelValue, values: current });
};

/** Toggle C or M: clears everything else and sets exclusively */
const toggleSpecial = (char: string) => {
  const already = isSelected(char);
  emit('update:modelValue', {
    ...props.modelValue,
    values:   already ? [] : [char],
    operator: ':',
  });
};
</script>
