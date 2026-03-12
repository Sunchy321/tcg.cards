<template>
  <div class="flex flex-col items-center">
    <!-- Stacked card images -->
    <div class="card-stack" :style="stackStyle">
      <img
        v-for="j in count"
        :key="j"
        :src="cardImageUrl"
        class="card-img"
        :style="{ left: `${(j - 1) * 12}px` }"
      >
    </div>

    <!-- Type label -->
    <div class="mt-1 text-center text-xs leading-tight">
      {{ typeName }}
      <span v-if="count > 1"> ×{{ count }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  type:  string;
  count: number;
}>();

const { t, te } = useI18n();

const typeName = computed(() => {
  const key = `magic.set.booster.type.${props.type}`;
  if (te(key)) return t(key);
  // fallback key lookup in en
  if (te(key, 'en')) return t(key, 'en' as any);
  return props.type;
});

// Determine which card placeholder image to show
const cardImageUrl = computed(() => {
  const slug = props.type.toLowerCase().replace(/_/g, '-');
  const known = ['uncommon', 'rare', 'rare-mythic', 'mythic-rare'];
  return known.includes(slug) ? `/card/${slug}.svg` : '/card/default.svg';
});

// Grid layout: single card or fanned stack
const CARD_WIDTH = 60;
const OVERLAP = 12;

const stackStyle = computed(() => ({
  width:  `${count.value === 1 ? CARD_WIDTH : CARD_WIDTH + OVERLAP * (count.value - 1)}px`,
  height: `${Math.round(CARD_WIDTH * 1.4)}px`,
}));

// keep reactivity in template
const count = computed(() => props.count);
</script>

<style scoped>
.card-stack {
  position: relative;
}

.card-img {
  position: absolute;
  width: v-bind('`${CARD_WIDTH}px`');
  top: 0;
}
</style>
