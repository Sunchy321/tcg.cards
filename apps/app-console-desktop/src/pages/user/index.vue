<script setup lang="ts">
import { computed } from 'vue';
import { currentAuthState } from '../../auth';

const session = computed(() => currentAuthState.value);
const user = computed(() => session.value?.user);
</script>

<template>
  <div class="flex-1 overflow-y-auto p-6">
    <div class="mx-auto max-w-2xl space-y-4">
      <h1 class="text-lg font-semibold text-slate-900">
        账号
      </h1>
      <div v-if="user" class="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
        <div class="flex items-center gap-4">
          <div class="flex h-12 w-12 items-center justify-center rounded-full bg-primary-100 text-base font-semibold text-primary-700">
            {{ user.name.slice(0, 1).toUpperCase() }}
          </div>
          <div>
            <p class="font-medium text-slate-900">{{ user.name }}</p>
            <p class="text-sm text-slate-500">{{ user.email }}</p>
          </div>
        </div>
        <dl class="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <div>
            <dt class="text-xs font-medium uppercase tracking-wide text-slate-400">用户名</dt>
            <dd class="mt-1 text-slate-900">{{ user.username ?? '—' }}</dd>
          </div>
          <div>
            <dt class="text-xs font-medium uppercase tracking-wide text-slate-400">角色</dt>
            <dd class="mt-1 text-slate-900">{{ user.role }}</dd>
          </div>
          <div>
            <dt class="text-xs font-medium uppercase tracking-wide text-slate-400">Session 到期</dt>
            <dd class="mt-1 font-mono text-xs text-slate-700">{{ session?.session.expiresAt }}</dd>
          </div>
        </dl>
      </div>
      <div v-else class="text-sm text-slate-500">
        未登录
      </div>
    </div>
  </div>
</template>
