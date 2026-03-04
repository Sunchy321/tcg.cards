<template>
  <div />
</template>

<script setup lang="ts">
const actions = useMagicActions();

definePageMeta({
  layout:  'entry',
  actions: [
    getActionDef(actions.random),
  ],
});

const title = useTitle();

title.value = 'Magic: the Gathering';
</script>
