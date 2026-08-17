<template>
  <span class="armor-value" :style="sizeStyle" :aria-label="String(value)">
    <img
      class="armor-value-image"
      src="/icons/hearthstone/stats/armor.png"
      alt=""
      aria-hidden="true"
    >
    <span class="armor-value-number">{{ value }}</span>
  </span>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{
  value: number;
  size?:  number;
}>(), {
  size: 36,
});

// Exposes one stable square so armor values align with text badges without resizing rows.
const sizeStyle = computed(() => ({
  '--armor-size': `${props.size}px`,
}));
</script>

<style scoped>
.armor-value {
  position: relative;
  display: inline-flex;
  width: var(--armor-size);
  height: var(--armor-size);
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  isolation: isolate;
}

.armor-value-image {
  position: absolute;
  inset: -16% -12% -18% -12%;
  width: 124%;
  height: 134%;
  object-fit: contain;
  filter: drop-shadow(0 2px 2px rgb(0 0 0 / 0.42));
  z-index: 0;
}

.armor-value-number {
  position: absolute;
  top: 46%;
  left: 44.5%;
  display: block;
  min-width: 100%;
  z-index: 1;
  color: #f8f0dc;
  font-family: Georgia, "Times New Roman", serif;
  font-size: calc(var(--armor-size) * 0.6);
  font-weight: 900;
  line-height: 1;
  text-align: center;
  -webkit-text-stroke: calc(var(--armor-size) * 0.035) rgb(18 14 10 / 0.92);
  text-shadow:
    0 1px 0 rgb(0 0 0 / 0.85),
    1px 0 0 rgb(0 0 0 / 0.78),
    -1px 0 0 rgb(0 0 0 / 0.78),
    0 -1px 0 rgb(0 0 0 / 0.78),
    0 2px 3px rgb(0 0 0 / 0.6);
  transform: translate(-50%, -50%);
}
</style>
