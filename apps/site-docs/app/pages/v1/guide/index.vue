<template>
  <div class="mx-auto max-w-4xl px-6 py-12">
    <h1 class="text-2xl font-bold">
      {{ $t('nav.guide') }}
    </h1>

    <div class="mt-6">
      <MarkdownRenderer :source="source" />
    </div>
  </div>
</template>

<script setup lang="ts">
const markdownFiles = import.meta.glob<string>('/content/guide/**/*.md', {
  eager:  true,
  query:  '?raw',
  import: 'default',
});

const source = markdownFiles['/content/guide/index.md'] ?? '';
</script>
