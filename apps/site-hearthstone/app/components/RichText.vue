<template>
  <div class="hs-rich-text" v-html="rendered" />
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{
  disableNewline?: boolean;
}>(), {
  disableNewline: false,
});

const slots = defineSlots<{
  default: () => any[];
}>();

const rawText = computed(() => {
  const nodes = slots.default?.();
  if (!nodes || nodes.length === 0) return '';
  return nodes.map(n => (typeof n.children === 'string' ? n.children : '')).join('');
});

const rendered = computed(() => {
  let text = rawText.value.trim();

  text = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  text = text
    .replace(/\[b\](.*?)\[\/b\]/gis, '<strong>$1</strong>')
    .replace(/&lt;b&gt;(.*?)&lt;\/b&gt;/gis, '<strong>$1</strong>');

  text = text
    .replace(/\[i\](.*?)\[\/i\]/gis, '<em>$1</em>')
    .replace(/&lt;i&gt;(.*?)&lt;\/i&gt;/gis, '<em>$1</em>');

  text = text
    .replace(/\[x\]/gi, '')
    .replace(/&lt;\/?(?:b|i)&gt;/gi, '')
    .replace(/@/g, '');

  if (!props.disableNewline) {
    text = text.replace(/\n/g, '<br>');
  }

  return text;
});
</script>

<style scoped>
.hs-rich-text :deep(strong) {
  font-weight: 600;
}
</style>
