<template>
  <SettingsFrame title="远端登录" description="登录网页控制台账号后才能执行发布等远端操作；本地功能无需登录。">
    <UCard>
      <template #header><h2 class="font-medium">控制台账号</h2></template>
      <div v-if="loggedIn" class="space-y-3">
        <p class="text-sm">已登录：<span class="font-medium">{{ status?.username }}</span></p>
        <p class="text-xs text-muted">服务地址 {{ status?.baseUrl }}，有效期至 {{ expiryText }}</p>
        <UButton color="error" variant="soft" icon="i-lucide-log-out" :loading="busy" @click="logout">登出</UButton>
      </div>
      <div v-else class="max-w-md space-y-4">
        <p v-if="returnTo" class="text-sm text-primary">登录后将返回之前的操作。</p>
        <UFormField label="服务地址" hint="网页控制台的访问地址">
          <UInput
            v-model="baseUrl"
            placeholder="https://console.example.com"
            autocomplete="off"
            :disabled="busy"
            class="w-full"
          />
        </UFormField>
        <UFormField label="用户名">
          <UInput v-model="username" autocomplete="off" :disabled="busy" class="w-full" />
        </UFormField>
        <UFormField label="密码">
          <UInput
            v-model="password"
            type="password"
            autocomplete="new-password"
            :disabled="busy"
            class="w-full"
            @keydown.enter="login"
          />
        </UFormField>
        <p v-if="error" role="alert" class="text-sm text-error">{{ error }}</p>
        <UButton icon="i-lucide-log-in" :loading="busy" :disabled="!baseUrl || !username || !password" @click="login">
          登录
        </UButton>
      </div>
    </UCard>
  </SettingsFrame>
</template>

<script setup lang="ts">
import { settingsError } from '~/composables/useDesktopSettings';
import { useRemoteSession } from '~/composables/useRemoteSession';

definePageMeta({ layout: 'admin', title: '远端登录' });

const route = useRoute();
const { status, refresh } = useRemoteSession();
const baseUrl = ref('');
const username = ref('');
const password = ref('');
const error = ref('');
const busy = ref(false);
const loggedIn = computed(() => status.value?.loggedIn === true);
/** Human-readable session expiry for the logged-in view. */
const expiryText = computed(() => {
  const value = status.value?.expiresAt;
  return value ? new Date(value).toLocaleString() : '';
});

/** Only internal paths may be returned to after login. */
const returnTo = computed(() => {
  const value = typeof route.query.return === 'string' ? route.query.return : '';
  return value.startsWith('/') && !value.startsWith('//') ? value : '';
});

onMounted(async () => {
  await refresh().catch(() => {});
  baseUrl.value = status.value?.baseUrl ?? '';
});

/** Signs in through the main process and returns to the gated operation when guided here. */
async function login() {
  busy.value = true;
  error.value = '';
  try {
    status.value = await window.desktop.auth.login(baseUrl.value, username.value, password.value);
    password.value = '';
    if (status.value.loggedIn && returnTo.value) await navigateTo(returnTo.value);
  } catch (cause) {
    error.value = settingsError(cause);
  } finally {
    busy.value = false;
  }
}

/** Signs out and clears the encrypted session. */
async function logout() {
  busy.value = true;
  error.value = '';
  try {
    status.value = await window.desktop.auth.logout();
  } catch (cause) {
    error.value = settingsError(cause);
  } finally {
    busy.value = false;
  }
}
</script>
