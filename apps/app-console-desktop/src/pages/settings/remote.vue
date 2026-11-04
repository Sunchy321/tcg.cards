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
          <UInputMenu
            :model-value="baseUrl"
            :items="addressItems"
            :reset-search-term-on-blur="false"
            ignore-filter
            open-on-click
            trailing-icon="i-lucide-chevron-down"
            placeholder="https://console.example.com"
            autocomplete="off"
            :disabled="busy"
            class="w-full"
            @update:model-value="selectAddress"
            @input="editAddress"
          />
        </UFormField>
        <UFormField label="邮箱">
          <UInput v-model="email" type="email" autocomplete="username" :disabled="busy" class="w-full" />
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
        <UButton icon="i-lucide-log-in" :loading="busy" :disabled="!baseUrl || !email.trim() || !password" @click="login">
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

const DEFAULT_ADDRESS = 'https://console-api.tcg.cards';
const HISTORY_KEY = 'console-desktop-remote-login-history';

/** A service address and the email last used to sign in to it. */
interface LoginEntry {
  address: string;
  email:   string | null;
}

const route = useRoute();
const { status, refresh } = useRemoteSession();
const history = ref<LoginEntry[]>([]);
const baseUrl = ref(DEFAULT_ADDRESS);
const email = ref('');
const password = ref('');
const error = ref('');
const busy = ref(false);
const loggedIn = computed(() => status.value?.loggedIn === true);
const addressItems = computed(() => [...new Set([DEFAULT_ADDRESS, ...history.value.map(entry => entry.address)])]);

/** Adds HTTPS to addresses entered without a scheme. */
function withProtocol(value: string) {
  const address = value.trim();
  return !address || /^[a-z][a-z\d+.-]*:\/\//i.test(address) ? address : `https://${address}`;
}

/** Matches typed addresses to their canonical form returned after login. */
function addressKey(value: string) {
  try {
    return new URL(withProtocol(value)).href.replace(/\/$/, '');
  } catch {
    return value;
  }
}

/** Fills the email associated with the address in the input. */
function selectAddress(address: string) {
  const key = addressKey(address);
  if (key !== addressKey(baseUrl.value)) {
    email.value = history.value.find(entry => entry.address === key)?.email ?? '';
    password.value = '';
  }
  baseUrl.value = address;
}

/** Captures typed addresses without treating component search resets as user edits. */
function editAddress(event: Event) {
  if (event.target instanceof HTMLInputElement) {
    selectAddress(event.target.value);
  }
}

/** Updates the most recent login and keeps one entry per address. */
function rememberLogin(address: string, email: string) {
  const key = addressKey(address);
  history.value = [{ address: key, email }, ...history.value.filter(entry => entry.address !== key)];
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.value));
  } catch { /* The login remains valid when local storage is unavailable. */ }
}

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
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]');
    if (Array.isArray(saved)) {
      history.value = saved.filter(entry => typeof entry?.address === 'string').map(entry => ({
        address: entry.address,
        email:   typeof entry.email === 'string' ? entry.email : null,
      }));
    }
  } catch { /* Ignore unreadable login history. */ }
  const recent = history.value[0];
  if (recent) {
    baseUrl.value = recent.address;
    email.value = recent.email ?? '';
  }
  await refresh().catch(() => {});
  const current = status.value;
  if (current?.baseUrl && !recent) {
    baseUrl.value = addressKey(current.baseUrl);
  }
});

/** Signs in through the main process and returns to the gated operation when guided here. */
async function login() {
  busy.value = true;
  error.value = '';
  try {
    const account = email.value.trim();
    status.value = await window.desktop.auth.login(withProtocol(baseUrl.value), account, password.value);
    password.value = '';
    if (status.value.loggedIn && status.value.baseUrl) {
      baseUrl.value = addressKey(status.value.baseUrl);
      rememberLogin(status.value.baseUrl, account);
    }
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
