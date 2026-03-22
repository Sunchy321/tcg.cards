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

  // Escape HTML
  text = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Bold keyword patterns: [b]...[/b] or lines starting with keywords
  text = text.replace(/\[b\](.*?)\[\/b\]/g, '<strong>$1</strong>');

  // Italic
  text = text.replace(/\[i\](.*?)\[\/i\]/g, '<em>$1</em>');

  // Newlines to <br> unless disabled
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
