<template>
  <span class="magic-symbol" :class="classes" :style="featureStyle">{{ value }}</span>
</template>

<script setup lang="ts">
const props = defineProps<{
  value: string;
  type?: string[];
}>();

const resolvedType = computed(() => {
  const raw = props.type ?? ['modern'];

  // flat-cost = flat + cost
  const hasFlatCost = raw.includes('flat-cost');
  const hasCost = raw.includes('cost') || hasFlatCost;

  return {
    cost:     hasCost,
    flat:     raw.includes('flat') || (hasFlatCost && hasCost),
    mini:     raw.includes('mini'),
    tapOld1:  raw.includes('tap:old1'),
    tapOld2:  raw.includes('tap:old2'),
    whiteOld: raw.includes('white:old'),
  };
});

const isShadow = computed(() => resolvedType.value.cost && !resolvedType.value.flat);

const classes = computed(() => ({
  'ms-cost':      resolvedType.value.cost,
  'ms-shadow':    isShadow.value,
  'ms-flat':      resolvedType.value.flat,
  'ms-mini':      resolvedType.value.mini,
  'ms-tap-old1':  resolvedType.value.tapOld1,
  'ms-tap-old2':  resolvedType.value.tapOld2,
  'ms-white-old': resolvedType.value.whiteOld,
}));

const featureStyle = computed(() => {
  const features: string[] = [];

  // CSS font-feature-settings requires quoted feature tags; use escaped single-quotes
  if (isShadow.value) features.push('\'ss01\'');
  if (resolvedType.value.flat) features.push('\'ss02\'');
  if (resolvedType.value.tapOld1) features.push('\'salt\' 1');
  if (resolvedType.value.tapOld2) features.push('\'salt\' 2');
  if (resolvedType.value.whiteOld) features.push('\'salt\' 1');

  return features.length > 0
    ? { fontFeatureSettings: features.join(', ') }
    : {};
});
</script>
