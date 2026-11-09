<template>
  <div class="desktop-page">
    <div class="mx-auto max-w-2xl space-y-4">
      <h1 class="desktop-section-title">账号</h1>
      <UAlert v-if="error" color="error" variant="soft" icon="i-lucide-circle-alert" :description="error" />
      <div v-if="profile" class="desktop-panel space-y-4 p-6">
        <div class="flex items-center gap-4">
          <div class="flex size-12 items-center justify-center rounded-full bg-primary/10 text-base font-semibold text-primary">
            {{ displayInitial }}
          </div>
          <div>
            <p class="font-medium text-default">{{ profile.name }}</p>
            <p class="text-sm text-muted">{{ profile.email }}</p>
          </div>
          <UButton class="ml-auto" label="刷新" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="loading" @click="loadProfile" />
        </div>
        <dl class="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <div>
            <dt class="text-xs font-medium uppercase tracking-wide text-muted">用户名</dt>
            <dd class="mt-1 text-default">{{ profile.username ?? '—' }}</dd>
          </div>
          <div>
            <dt class="text-xs font-medium uppercase tracking-wide text-muted">角色</dt>
            <dd class="mt-1 text-default">{{ profile.role ?? '—' }}</dd>
          </div>
          <div class="col-span-2">
            <dt class="text-xs font-medium uppercase tracking-wide text-muted">Session 到期</dt>
            <dd class="mt-1 font-mono text-xs text-default">{{ expiryText }}</dd>
          </div>
        </dl>
      </div>
      <div v-else-if="loading" class="flex justify-center py-10">
        <UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-muted" />
      </div>
      <div v-else class="desktop-panel flex items-center justify-between gap-3 p-6">
        <p class="text-sm text-muted">未登录或登录已过期</p>
        <div class="flex gap-2">
          <UButton v-if="error" label="重试" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="loading" @click="loadProfile" />
          <UButton label="前往登录" icon="i-lucide-log-in" :to="{ path: '/settings/remote', query: { return: '/user' } }" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { RemoteAuthProfile } from '../../../electron/contract';
import { settingsError } from '~/composables/useDesktopSettings';

definePageMeta({ layout: 'admin', title: '账号' });

const profile = ref<RemoteAuthProfile | null>(null);
const loading = ref(true);
const error = ref('');
const displayInitial = computed(() => profile.value?.name.trim().slice(0, 1).toLocaleUpperCase() || '?');
const expiryText = computed(() => {
  const value = profile.value?.expiresAt;
  return value ? new Date(value).toLocaleString() : '—';
});

/** Reads account details through the fixed main-process auth operation. */
async function loadProfile() {
  loading.value = true;
  error.value = '';
  try {
    profile.value = await window.desktop.auth.profile();
  } catch (cause) {
    error.value = settingsError(cause);
    profile.value = null;
  } finally {
    loading.value = false;
  }
}

onMounted(loadProfile);
</script>
