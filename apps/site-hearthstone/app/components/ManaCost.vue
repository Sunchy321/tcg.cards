<template>
  <span class="mana-cost" :class="sizeClass" aria-label="Mana cost">
    <img
      src="/icons/mana-crystal.svg"
      alt=""
      class="mana-cost__image"
      aria-hidden="true"
    >
    <span class="mana-cost__value">{{ value }}</span>
  </span>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{
  value: number;
  size?: 'sm' | 'md';
}>(), {
  size: 'md',
});

const sizeClass = computed(() => `mana-cost--${props.size}`);
</script>

<style scoped>
.mana-cost {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  line-height: 1;
}

.mana-cost--sm {
  width: 2.25rem;
  height: 2.25rem;
  font-size: 1rem;
}

.mana-cost--md {
  width: 3rem;
  height: 3rem;
  font-size: 1.55rem;
}

.mana-cost__image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  filter: drop-shadow(0 2px 5px rgb(0 0 0 / 0.28));
}

.mana-cost__value {
  position: relative;
  z-index: 1;
  color: white;
  font-weight: 800;
  text-shadow:
    0 1px 0 #0a2d71,
    0 2px 4px rgb(0 0 0 / 0.65);
}
</style>
