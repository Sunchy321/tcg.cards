<template>
  <UTooltip :text="tooltipText">
    <span
      class="flex shrink-0 items-center"
      :class="widened ? 'text-amber-300' : 'text-white/70'"
    >
      <UIcon :name="`i:ambit-${ambit}`" class="size-4" />
    </span>
  </UTooltip>
</template>

<script setup lang="ts">
import type { Ambit } from '@tcg-cards/base';

const { ambit, widened = false } = defineProps<{
  /** The ambit the search actually landed on, as reported by the response. */
  ambit:    Ambit;
  /** True when stepwise widening moved the results past the requested ceiling. */
  widened?: boolean;
}>();

const { t } = useI18n();

const tooltipText = computed(() => widened
  ? t('ambit.widened', { level: t(`ambit.${ambit}`) })
  : t(`ambit.${ambit}`));
</script>
