<template>
  <UTooltip :text="tooltip" :prevent="tooltip === ''">
    <span class="inline-flex items-center gap-1 w-32" :class="[color, align === 'right' ? 'flex-row-reverse justify-start' : '']">
      <UIcon :name="icon" class="shrink-0" />
      <span>{{ shortLabel }}</span>
      <span v-if="tooltip" class="text-xs opacity-60">…</span>
    </span>
  </UTooltip>
</template>

<script setup lang="ts">
const props = defineProps<{
  status: string;
  align?: 'left' | 'right';
}>();

const { t, te } = useI18n();

const ICON: Record<string, string> = {
  legal:               'mdi:check-circle-outline',
  restricted:          'mdi:alert-circle-outline',
  suspended:           'mdi:minus-circle-outline',
  banned:              'mdi:close-circle-outline',
  banned_in_bo1:       'mdi:progress-close',
  banned_as_commander: 'mdi:crown-circle-outline',
  banned_as_companion: 'mdi:heart-circle-outline',
  game_changer:        'mdi:eye-circle-outline',
  unavailable:         'mdi:cancel',
};

const COLOR: Record<string, string> = {
  legal:               'text-green-600',
  restricted:          'text-amber-500',
  suspended:           'text-red-400',
  banned:              'text-red-600',
  banned_in_bo1:       'text-red-600',
  banned_as_commander: 'text-red-600',
  banned_as_companion: 'text-red-600',
  game_changer:        'text-blue-600',
  unavailable:         'text-gray-400',
};

// Long statuses that are shortened to "banned" in display; full text shown in tooltip
const SHORT_LABEL: Record<string, string> = {
  banned_in_bo1:       'banned',
  banned_as_commander: 'banned',
  banned_as_companion: 'banned',
};

const isScore = computed(() => /^score-\d+$/.test(props.status));
const scoreValue = computed(() => isScore.value ? parseInt(props.status.slice(6)) : null);

const icon = computed(() => {
  if (isScore.value) return 'mdi:counter';
  return ICON[props.status] ?? 'mdi:help-circle-outline';
});

const color = computed(() => {
  if (isScore.value) return 'text-purple-600';
  return COLOR[props.status] ?? 'text-gray-700';
});

const fullLabel = computed(() => {
  if (isScore.value) {
    return te('magic.legality.score') ? t('magic.legality.score', { n: scoreValue.value }) : `Score ${scoreValue.value}`;
  }

  return te(`magic.legality.${props.status}`) ? t(`magic.legality.${props.status}`) : props.status.replace(/_/g, ' ');
});

const shortLabel = computed(() => {
  if (isScore.value) {
    return te('magic.legality.score') ? t('magic.legality.score', { n: scoreValue.value }) : `Score ${scoreValue.value}`;
  }

  if (props.status in SHORT_LABEL) {
    return te('magic.legality.banned') ? t('magic.legality.banned') : 'banned';
  }

  return fullLabel.value;
});

const tooltip = computed(() => shortLabel.value !== fullLabel.value ? fullLabel.value : '');
</script>
