<template>
  <div class="desktop-page">
    <div class="mx-auto max-w-2xl space-y-4">
      <h1 class="desktop-section-title">
        账号
      </h1>
      <div v-if="user" class="desktop-panel space-y-4 p-6">
        <div class="flex items-center gap-4">
          <div class="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-base font-semibold text-primary">
            {{ user.name.slice(0, 1).toUpperCase() }}
          </div>
          <div>
            <p class="font-medium text-default">{{ user.name }}</p>
            <p class="text-sm text-muted">{{ user.email }}</p>
          </div>
        </div>
        <dl class="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <div>
            <dt class="text-xs font-medium uppercase tracking-wide text-muted">用户名</dt>
            <dd class="mt-1 text-default">{{ user.username ?? '—' }}</dd>
          </div>
          <div>
            <dt class="text-xs font-medium uppercase tracking-wide text-muted">角色</dt>
            <dd class="mt-1 text-default">{{ user.role }}</dd>
          </div>
          <div>
            <dt class="text-xs font-medium uppercase tracking-wide text-muted">Session 到期</dt>
            <dd class="mt-1 font-mono text-xs text-default">{{ session?.session.expiresAt }}</dd>
          </div>
        </dl>
      </div>
      <div v-else class="text-sm text-muted">
        未登录
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { currentAuthState } from '../../auth';

definePageMeta({
  layout: 'admin',
  title:  '账号',
});

const session = computed(() => currentAuthState.value);
const user = computed(() => session.value?.user);
</script>
