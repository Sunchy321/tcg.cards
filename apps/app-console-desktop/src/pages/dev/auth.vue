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
  </div>
</template>

<script setup lang="ts">
import { useRemoteSession } from '~/composables/useRemoteSession';

definePageMeta({ layout: 'admin', title: '登录与会话测试' });

const { status, refresh, requireSession } = useRemoteSession();
const busy = ref(false);
const result = ref('');

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
</script>
