<template>
  <div />
</template>

<script setup lang="ts">
const { setActions } = useActions();
const actionMeta = getMagicActionMeta();
const actions = useMagicActions();

definePageMeta({
  layout:  'entry',
  title:   'Magic: the Gathering',
  actions: [actionMeta.random],
});

setActions([actions.random]);
</script>
