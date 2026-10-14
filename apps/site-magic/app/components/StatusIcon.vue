<template>
  <UTooltip v-if="status" :text="label">
    <span
      class="inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-current text-xs"
      :class="style.cls"
    >
      <UIcon :name="style.icon" />
    </span>
  </UTooltip>
</template>

<script setup lang="ts">
const props = defineProps<{
  status: string;
}>();

const { t, te } = useI18n();

const STATUS_ICONS: Record<string, { icon: string, cls: string }> = {
  banned:              { icon: 'lucide:x', cls: 'text-red-500 border-red-400' },
  banned_as_commander: { icon: 'lucide:crown', cls: 'text-red-500 border-red-400' },
  banned_as_companion: { icon: 'lucide:heart', cls: 'text-red-500 border-red-400' },
  banned_in_bo1:       { icon: 'lucide:calendar-x', cls: 'text-orange-500 border-orange-400' },
  restricted:          { icon: 'lucide:circle-slash', cls: 'text-orange-500 border-orange-400' },
  suspended:           { icon: 'lucide:pause-circle', cls: 'text-orange-500 border-orange-400' },
  game_changer:        { icon: 'lucide:star', cls: 'text-amber-500 border-amber-400' },
  score:               { icon: 'lucide:hash', cls: 'text-sky-500 border-sky-400' },
  legal:               { icon: 'lucide:check', cls: 'text-emerald-500 border-emerald-400' },
  unavailable:         { icon: 'lucide:x', cls: 'text-gray-400 border-gray-300' },
  extend:              { icon: 'lucide:plus', cls: 'text-violet-500 border-violet-400' },
  buff:                { icon: 'lucide:trending-up', cls: 'text-emerald-500 border-emerald-400' },
  nerf:                { icon: 'lucide:trending-down', cls: 'text-red-500 border-red-400' },
  tweak:               { icon: 'lucide:sliders-horizontal', cls: 'text-sky-500 border-sky-400' },
  revert:              { icon: 'lucide:undo-2', cls: 'text-slate-500 border-slate-400' },
  rework:              { icon: 'lucide:refresh-cw', cls: 'text-sky-500 border-sky-400' },
  text_fix:            { icon: 'lucide:pencil', cls: 'text-slate-500 border-slate-400' },
  text_adjust:         { icon: 'lucide:pencil', cls: 'text-slate-500 border-slate-400' },
  bugged:              { icon: 'lucide:bug', cls: 'text-red-500 border-red-400' },
  bugfix:              { icon: 'lucide:bug-off', cls: 'text-emerald-500 border-emerald-400' },
};

const style = computed(() =>
  STATUS_ICONS[props.status] ?? { icon: 'lucide:dot', cls: 'text-gray-400 border-gray-300' });

const label = computed(() => {
  const key = `magic.changeStatus.${props.status}`;
  return te(key) ? t(key) : props.status;
});
</script>
