<template>
  <div class="hs-rich-text" v-html="rendered" />
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{
  disableNewline?: boolean;
  preserveLineBreaks?: boolean;
  flattenLineBreaks?: boolean;
}>(), {
  disableNewline: false,
  preserveLineBreaks: true,
  flattenLineBreaks: false,
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
    .replace(/\$[a-z]+(\d+)/gi, '$1')
    .replace(/#(\d+)/g, '$1')
    .replace(/\s*[\(（]?\{\d+\}[\)）]?/g, '')
    .replace(/\s+([.,!?;:。！？；：])/g, '$1')
    .replace(/@/g, '');

  if (props.flattenLineBreaks) {
    text = text.replace(/\s*\r?\n\s*/g, ' ');
  } else if (props.preserveLineBreaks && !props.disableNewline) {
    text = text.replace(/\r?\n/g, '<br>');
  }

  return text.trim();
});
</script>

<style scoped>
.hs-rich-text :deep(strong) {
  font-weight: 600;
}
</style>
