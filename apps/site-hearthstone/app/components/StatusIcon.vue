<template>
  <UTooltip :text="tooltip">
    <span class="inline-flex items-center justify-center w-5 h-5 rounded-full border border-current text-current shrink-0">
      <UIcon :name="icon" class="text-xs" />
    </span>
  </UTooltip>
</template>

<script setup lang="ts">
const props = defineProps<{ status: string }>();

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
  banned:              'lucide:ban',
  banned_in_card_pool: 'lucide:ban',
  banned_in_deck:      'lucide:ban',
  legal:               'lucide:circle-check',
  unavailable:         'lucide:circle-x',
  minor:               'lucide:minus-circle',
  score:               'lucide:hash',
  extend:              'lucide:plus-circle',
  format_birth:        'lucide:sparkles',
  format_death:        'lucide:skull',
};

const icon = computed(() => map[props.status] ?? 'lucide:circle-dot');

const tooltips: Record<string, string> = {
  buff:                'Buff — card was strengthened',
  nerf:                'Nerf — card was weakened (full dust refund)',
  tweak:               'Tweak — minor balance adjustment',
  revert:              'Revert — change rolled back after rotation',
  rework:              'Rework — mechanics / type / tribe changed',
  text_fix:            'Text Fix — incorrect text corrected',
  text_adjust:         'Text Adjust — intentional text update',
  bugged:              'Bugged — card data was corrupted',
  bugfix:              'Bug Fix — data bug was fixed',
  banned:              'Banned — fully banned',
  banned_in_card_pool: 'Banned in card pool',
  banned_in_deck:      'Banned in deck building',
  legal:               'Legal — fully playable',
  unavailable:         'Unavailable — not playable',
  minor:               'Minor — limited availability (derived or restricted)',
  score:               'Score — points-based legality',
  extend:              'Extend — set content expanded (e.g. mini-set)',
  format_birth:        'Format Birth — new format launched',
  format_death:        'Format Death — format retired',
};

const tooltip = computed(() => tooltips[props.status] ?? props.status);
</script>
