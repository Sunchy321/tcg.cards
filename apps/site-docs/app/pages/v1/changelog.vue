<template>
  <div class="mx-auto max-w-4xl px-6 py-12">
    <h1 class="text-2xl font-bold">
      {{ $t('nav.changelog') }}
    </h1>

    <div class="mt-6">
      <MarkdownRenderer :source="source" />
    </div>
  </div>
</template>

<script setup lang="ts">
const { t, locale } = useI18n();
useTitle(() => t('nav.changelog'));

const markdownFiles = import.meta.glob<string>('/content/changelog/*.md', {
  eager:  true,
  query:  '?raw',
  import: 'default',
});

const source = computed(() => markdownFiles[`/content/changelog/${locale.value}.md`] ?? markdownFiles['/content/changelog/en.md'] ?? '');
</script>
