<template>
  <UTooltip :text="tooltip">
    <span class="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current text-current">
      <UIcon :name="icon" class="text-xs" />
    </span>
  </UTooltip>
</template>

<script setup lang="ts">
const props = defineProps<{ status: string }>();

const { t, te } = useI18n();

const map: Record<string, string> = {
  buff:                'lucide:trending-up',
  nerf:                'lucide:trending-down',
  tweak:               'lucide:sliders-horizontal',
  revert:              'lucide:undo-2',
  rework:              'lucide:refresh-cw',
  text_fix:            'lucide:pencil',
  text_adjust:         'lucide:pencil',
  bugged:              'lucide:bug',
  bugfix:              'lucide:bug-off',
  banned:              'lucide:shield-x',
  banned_in_card_pool: 'lucide:shield-x',
  banned_in_deck:      'lucide:shield-x',
  legal:               'lucide:check',
  unavailable:         'lucide:x',
  minor:               'lucide:minus',
  score:               'lucide:hash',
  extend:              'lucide:plus',
  format_birth:        'lucide:sparkles',
  format_death:        'lucide:skull',
};

const icon = computed(() => map[props.status] ?? 'lucide:dot');

const tooltip = computed(() => {
  const key = `hearthstone.changeStatus.${props.status}`;
  return te(key) ? t(key) : props.status;
});
</script>
