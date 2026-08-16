<template>
  <div class="flex items-center gap-2 px-4 py-2">
    <div v-if="isBlocking" class="flex items-center gap-2">
      <span class="text-xs text-muted">当前任务类型被其他 scope 的任务占用</span>
      <UButton v-if="canCancel" size="xs" color="neutral" variant="soft" @click="emit('cancel')">
        取消阻塞任务
      </UButton>
    </div>
    <div v-else class="flex items-center gap-2 ml-auto">
      <slot name="actions" />
      <UButton
        v-if="canPause"
        color="neutral"
        variant="soft"
        @click="emit('pause')"
      >
        <UIcon name="lucide:pause" class="size-3.5" />
        暂停
      </UButton>
      <UButton
        v-if="canResume"
        color="primary"
        variant="soft"
        @click="emit('resume')"
      >
        <UIcon name="lucide:play" class="size-3.5" />
        继续
      </UButton>
      <UButton
        v-if="canCancel"
        color="error"
        variant="soft"
        @click="emit('cancel')"
      >
        <UIcon name="lucide:square" class="size-3.5" />
        取消
      </UButton>
      <UButton
        v-if="isTerminal"
        color="primary"
        variant="solid"
        @click="emit('retry')"
      >
        <UIcon name="lucide:rotate-ccw" class="size-3.5" />
        重试
      </UButton>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  canPause:   boolean;
  canResume:  boolean;
  canCancel:  boolean;
  isTerminal: boolean;
  isBlocking: boolean;
}>();

const emit = defineEmits<{
  pause:  [];
  resume: [];
  cancel: [];
  retry:  [];
}>();
</script>
