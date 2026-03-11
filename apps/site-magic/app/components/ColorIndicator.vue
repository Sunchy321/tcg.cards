<template>
  <svg viewBox="0 0 100 100" class="size-3.5 inline-block">
    <template v-if="colors.length === 0">
      <circle r="50" cy="50" cx="50" stroke="black" stroke-width="5" />
    </template>
    <template v-else-if="colors.length === 1">
      <circle r="50" cy="50" cx="50" :fill="colors[0]" />
    </template>
    <template v-else-if="colors.length === 2">
      <path d="M50,50,14.64,85.36A50,50,0,0,1,85.36,14.64Z" :fill="colors[0]" />
      <path d="M50,50,85.36,14.64A50,50,0,0,1,14.64,85.36Z" :fill="colors[1]" />
    </template>
    <template v-else-if="colors.length === 3">
      <path d="M50,50,93.3,25A50,50,0,0,1,50,100Z" :fill="colors[0]" />
      <path d="M50,50v50A50,50,0,0,1,6.69,25Z" :fill="colors[1]" />
      <path d="M50,50,6.7,25a50,50,0,0,1,86.6,0Z" :fill="colors[2]" />
    </template>
  </svg>
</template>

<script setup lang="ts">
const props = defineProps<{
  value: string;
}>();

const colorMap: Record<string, string> = {
  W: '#F5F1ED',
  U: '#006BA7',
  B: '#3C3734',
  R: '#E5412A',
  G: '#006B47',
};

const colors = computed(() => props.value.split('').map(v => colorMap[v]).filter(Boolean) as string[]);
</script>
