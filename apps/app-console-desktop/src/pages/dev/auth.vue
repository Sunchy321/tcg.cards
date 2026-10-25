<template>
  <div class="mx-auto max-w-3xl space-y-5">
    <h2 class="text-xl font-semibold">登录与会话测试</h2>
    <p class="text-sm text-gray-500 dark:text-gray-400">验证需要登录的远端操作的引导与返回流程。</p>

    <div class="rounded-lg border border-gray-200 bg-white p-4 space-y-3 dark:border-gray-800 dark:bg-gray-900">
      <p class="text-sm">
        当前状态：
        <span v-if="status?.loggedIn">已登录 {{ status.username }}</span>
        <span v-else>未登录</span>
      </p>
      <UButton :loading="busy" @click="run">执行需要登录的操作</UButton>
      <p v-if="result" role="status" class="text-sm text-muted">{{ result }}</p>
    </div>

    <div class="rounded-lg border border-gray-200 bg-white p-4 space-y-3 dark:border-gray-800 dark:bg-gray-900">
      <p class="text-sm">发布任务在启动前需要通过发布权限检查；未登录、无权限或服务不可达时不会启动。</p>
      <UButton :loading="publishBusy" @click="runPublish">启动发布任务</UButton>
      <p v-if="publishError" role="alert" class="text-sm text-error">{{ publishError }}</p>
      <p v-else-if="publishResult" role="status" class="text-sm text-muted">{{ publishResult }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { settingsError } from '~/composables/useDesktopSettings';
import { useRemoteSession } from '~/composables/useRemoteSession';

definePageMeta({ layout: 'admin', title: '登录与会话测试' });

const { status, refresh, requireSession } = useRemoteSession();
const busy = ref(false);
const result = ref('');
const publishBusy = ref(false);
const publishError = ref('');
const publishResult = ref('');

onMounted(() => {
  void refresh().catch(() => {});
});

/** Runs one gated operation; the session gate decides whether it proceeds. */
async function run() {
  busy.value = true;
  result.value = '';
  try {
    // A gated remote operation proceeds only with a valid session.
    if (await requireSession()) result.value = '操作已执行。';
  } finally {
    busy.value = false;
  }
}

/** Starts the admission-gated development publish task end to end. */
async function runPublish() {
  publishBusy.value = true;
  publishError.value = '';
  publishResult.value = '';
  try {
    if (!await requireSession()) return;
    const started = await window.desktop.tasks.start('dev_publish', { steps: 4 });
    if (!started) return;
    for (let attempt = 0; attempt < 80; attempt++) {
      const task = await window.desktop.tasks.get(started.taskRunId);
      if (task?.status === 'completed') {
        publishResult.value = '发布任务已完成。';
        return;
      }
      if (task?.status === 'failed') throw new Error(task.errorMessage ?? '发布任务失败。');
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error('发布任务未在预期时间内结束。');
  } catch (cause) {
    publishError.value = settingsError(cause);
  } finally {
    publishBusy.value = false;
  }
}
</script>
