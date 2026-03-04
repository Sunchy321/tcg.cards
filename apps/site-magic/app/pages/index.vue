<template>
  <div />
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'entry',
});

const title = useTitle();

title.value = 'Magic: the Gathering';
</script>
