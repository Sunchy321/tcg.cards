<template>
  <UFooter class="bg-gray-50 border-t">
    <div class="container mx-auto px-4 text-center text-sm text-gray-600">
      <NuxtLink
        :to="rootUrl"
        class="hover:text-gray-900 transition-colors"
      >
        &copy; {{ currentYear }} All rights reserved.
      </NuxtLink>
    </div>
  </UFooter>
</template>

<script setup lang="ts">
const currentYear = new Date().getFullYear();

const url = useRequestURL();

const rootUrl = import.meta.dev
  ? 'http://localhost:3000'
  : `${url.protocol}//${url.hostname.split('.').slice(-2).join('.')}`;
</script>
