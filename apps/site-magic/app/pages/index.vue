<template>
  <div />
</template>

<script setup lang="ts">
const { setActions } = useActions();
const actionMeta = getMagicActionMeta();
const actions = useMagicActions();

definePageMeta({
  layout:  'entry',
  actions: [actionMeta.random],
});

const title = useTitle();

title.value = 'Magic: the Gathering';

setActions([actions.random]);
</script>
