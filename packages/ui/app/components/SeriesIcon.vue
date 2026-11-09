<template>
  <span class="inline-flex size-8 shrink-0 items-center justify-center" aria-hidden="true">
    <img
      v-if="currentSrc"
      :key="currentSrc"
      :src="currentSrc"
      alt=""
      loading="lazy"
      class="size-7 object-contain dark:brightness-0 dark:invert"
      @error="sourceIndex += 1"
    >
  </span>
</template>

<script setup lang="ts">
const props = defineProps<{ src?: string, fallbackSrc?: string }>();
const sourceIndex = ref(0);
const sources = computed(() => [props.src, props.fallbackSrc].filter((source): source is string => Boolean(source)));
const currentSrc = computed(() => sources.value[sourceIndex.value]);

watch([() => props.src, () => props.fallbackSrc], () => {
  sourceIndex.value = 0;
});
</script>
