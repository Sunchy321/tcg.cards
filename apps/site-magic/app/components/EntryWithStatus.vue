<template>
  <div
    class="flex min-w-0 items-center gap-2 rounded-lg px-2 py-1 text-gray-900 dark:text-gray-100"
    :class="status == null || (status === 'score' && score != null) ? '' : STATUS_TINT[status] ?? ''"
    :style="status === 'score' && score != null ? scoreTint : undefined"
  >
    <StatusIcon v-if="status" :status="status" :score="score" />
    <div class="flex min-w-0 flex-1 items-center gap-2">
      <slot />
    </div>
    <a
      v-if="date && dateLink"
      :href="dateLink"
      target="_blank"
      class="shrink-0 font-mono text-xs text-gray-500 dark:text-gray-400"
    >{{ date }}</a>
    <span v-else-if="date" class="shrink-0 font-mono text-xs text-gray-500 dark:text-gray-400">{{ date }}</span>
    <slot name="actions" />
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  status?:   string | null;
  score?:    number | null;
  date?:     string | null;
  dateLink?: string;
}>();
const colorMode = useColorMode();

const STATUS_TINT: Record<string, string> = {
  banned:              'bg-red-50 dark:bg-red-900/40',
  banned_as_commander: 'bg-red-50 dark:bg-red-900/40',
  banned_as_companion: 'bg-red-50 dark:bg-red-900/40',
  banned_in_bo1:       'bg-orange-50 dark:bg-orange-900/40',
  restricted:          'bg-orange-50 dark:bg-orange-900/40',
  suspended:           'bg-orange-50 dark:bg-orange-900/40',
  game_changer:        'bg-amber-50 dark:bg-amber-900/40',
  score:               'bg-sky-50 dark:bg-sky-900/40',
  legal:               'bg-emerald-50 dark:bg-emerald-900/40',
  unavailable:         'bg-gray-100 dark:bg-gray-800/60',
  extend:              'bg-violet-50 dark:bg-violet-900/40',
  buff:                'bg-emerald-50 dark:bg-emerald-900/40',
  nerf:                'bg-red-50 dark:bg-red-900/40',
  tweak:               'bg-sky-50 dark:bg-sky-900/40',
  revert:              'bg-slate-100 dark:bg-slate-800/60',
  rework:              'bg-sky-50 dark:bg-sky-900/40',
  text_fix:            'bg-slate-100 dark:bg-slate-800/60',
  text_adjust:         'bg-slate-100 dark:bg-slate-800/60',
  bugged:              'bg-red-50 dark:bg-red-900/40',
  bugfix:              'bg-emerald-50 dark:bg-emerald-900/40',
};

const scoreTint = computed(() => {
  const hue = 120 - Math.min(Math.max((props.score ?? 1) - 1, 0), 9) * 12;
  return {
    backgroundColor: colorMode.value === 'dark'
      ? `hsl(${hue} 45% 22% / 40%)`
      : `hsl(${hue} 75% 96%)`,
  };
});
</script>
