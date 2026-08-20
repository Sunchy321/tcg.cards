<template>
  <div
    class="prose prose-neutral dark:prose-invert max-w-none"
    v-html="html"
  />
</template>

<script setup lang="ts">
import MarkdownIt from 'markdown-it';

const props = withDefaults(defineProps<{
  source?: string;
}>(), {
  source: '',
});

const md = new MarkdownIt({
  html:    true,
  linkify: true,
  breaks:  false,
});

const html = computed(() => md.render(props.source));
</script>
