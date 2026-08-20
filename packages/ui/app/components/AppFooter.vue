<template>
  <UFooter class="bg-gray-50 border-t">
    <div class="container mx-auto px-4 flex items-center justify-center gap-2 text-sm text-gray-600">
      <NuxtLink
        :to="rootUrl"
        class="hover:text-gray-900 transition-colors"
      >
        &copy; {{ currentYear }} All rights reserved.
      </NuxtLink>
      <span class="text-gray-400" aria-hidden="true">&middot;</span>
      <NuxtLink
        :to="githubUrl"
        target="_blank"
        rel="noopener"
        class="inline-flex items-center gap-1 hover:text-gray-900 transition-colors"
      >
        <UIcon name="i-simple-icons-github" class="size-4" />
        GitHub
      </NuxtLink>
    </div>
  </UFooter>
</template>

<script setup lang="ts">
const currentYear = new Date().getFullYear();

const githubUrl = 'https://github.com/Sunchy321/tcg.cards';

const url = useRequestURL();

const rootUrl = import.meta.dev
  ? 'http://localhost:3000'
  : `${url.protocol}//${url.hostname.split('.').slice(-2).join('.')}`;
</script>
