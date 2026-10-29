<template>
  <UPopover
    v-model:open="open"
    :content="{ side: 'bottom', align: 'end' }"
    :ui="{ content: 'w-96 max-w-[calc(100vw-2rem)] p-0' }"
  >
    <UButton
      icon="i-lucide-list-checks"
      color="neutral"
      variant="ghost"
      size="sm"
      :aria-label="active.length > 0 ? `任务 ${active.length}` : '任务'"
    >
      任务<span v-if="active.length > 0"> {{ active.length }}</span>
    </UButton>

    <template #content>
      <div class="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-800 dark:bg-gray-900">
        <div class="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-800">
          <h2 class="text-sm font-semibold">当前任务</h2>
          <UButton
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="ghost"
            size="xs"
            aria-label="刷新任务"
            @click.stop="void refresh()"
          />
        </div>

        <UAlert v-if="listError" class="m-3" color="error" variant="soft" :description="listError" />
        <p v-else-if="active.length === 0" class="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
          当前没有进行中的任务。
        </p>
        <div v-else class="max-h-[70vh] space-y-3 overflow-y-auto p-3">
          <TaskItem v-for="task in active" :key="task.id" :task="task" />
        </div>
      </div>
    </template>
  </UPopover>
</template>

<script setup lang="ts">
const open = ref(false);
const { active, listError, refresh } = useTasks();
</script>
