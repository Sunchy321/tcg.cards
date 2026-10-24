<template>
  <UButton
    icon="i-lucide-list-checks"
    color="neutral"
    variant="ghost"
    size="sm"
    to="/tasks"
  >
    任务<span v-if="active.length > 0"> {{ active.length }}</span>
  </UButton>
</template>

<script setup lang="ts">
const { active } = useTasks();
</script>
