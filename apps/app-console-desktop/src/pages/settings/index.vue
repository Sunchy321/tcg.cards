<script setup lang="ts">
import { computed, ref } from 'vue';
import { currentAuthState } from '../../auth';

const baseUrl = computed(() => currentAuthState.value?.baseUrl ?? '—');
const copied = ref(false);

function copyUrl() {
  if (currentAuthState.value?.baseUrl) {
    navigator.clipboard.writeText(currentAuthState.value.baseUrl);
    copied.value = true;
    setTimeout(() => { copied.value = false; }, 2000);
  }
}
</script>

<template>
  <div class="flex-1 overflow-y-auto p-6">
    <div class="mx-auto max-w-2xl space-y-4">
      <h1 class="text-lg font-semibold text-slate-900">
        设置
      </h1>
      <div class="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
        <div>
          <p class="text-sm font-medium text-slate-700">服务地址</p>
          <div class="mt-2 flex items-center gap-2">
            <code class="flex-1 rounded-lg bg-slate-100 px-3 py-2 font-mono text-xs text-slate-800 break-all">
              {{ baseUrl }}
            </code>
            <UButton
              icon="i-lucide-copy"
              color="neutral"
              variant="ghost"
              size="sm"
              :label="copied ? '已复制' : '复制'"
              @click="copyUrl"
            />
          </div>
          <p class="mt-2 text-xs text-slate-500">
            登录时输入的服务地址。如需修改请退出登录后重新配置。
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
