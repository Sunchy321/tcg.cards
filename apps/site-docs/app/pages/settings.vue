<template>
  <div class="mx-auto max-w-2xl px-6 py-12">
    <h1 class="text-2xl font-bold text-highlighted">
      {{ $t('nav.settings') }}
    </h1>

    <!-- Account card -->
    <div class="mt-6">
      <UCard>
        <template v-if="session.data">
          <div class="flex items-center justify-between gap-3">
            <div class="flex items-center gap-3">
              <UAvatar :alt="session.data.user.name ?? session.data.user.email" size="md" class="shrink-0" />
              <div class="min-w-0">
                <p class="truncate text-sm font-semibold text-highlighted">
                  {{ session.data.user.name ?? session.data.user.email }}
                </p>
                <p class="truncate text-xs text-muted">{{ session.data.user.email }}</p>
              </div>
            </div>
            <UButton color="error" variant="soft" icon="i-lucide-log-out" size="sm" :loading="loggingOut" @click="logout">
              {{ $t('settings.logout') }}
            </UButton>
          </div>
        </template>

        <template v-else>
          <form class="flex flex-col gap-3" @submit.prevent="login">
            <p class="mb-0.5 text-xs font-semibold tracking-wide text-muted uppercase">
              {{ $t('settings.login') }}
            </p>
            <UInput v-model="loginEmail" type="email" autocomplete="email" :placeholder="$t('settings.emailPlaceholder')" />
            <UInput v-model="loginPassword" type="password" autocomplete="current-password" :placeholder="$t('settings.passwordPlaceholder')" />
            <UAlert v-if="loginError" color="error" variant="soft" :description="loginError" class="text-xs" />
            <UButton type="submit" color="primary" size="sm" class="w-full justify-center" :loading="loggingIn">
              {{ $t('settings.login') }}
            </UButton>
          </form>
        </template>
      </UCard>
    </div>

    <!-- API keys (login required) -->
    <div v-if="session.data" class="mt-8">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold text-highlighted">{{ $t('settings.apiKeys.title') }}</h2>
        <UButton color="primary" size="sm" icon="i-lucide-plus" @click="openCreateDialog">
          {{ $t('settings.apiKeys.create') }}
        </UButton>
      </div>

      <!-- Key list -->
      <div class="mt-4 flex flex-col gap-3">
        <UCard v-for="key in apiKeys" :key="key.id">
          <div class="flex items-start justify-between gap-4">
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <span class="truncate text-sm font-semibold text-highlighted">{{ key.name ?? key.start }}</span>
                <UBadge :color="key.enabled ? 'success' : 'error'" variant="subtle" size="sm">
                  {{ key.enabled ? $t('settings.apiKeys.enabled') : $t('settings.apiKeys.disabled') }}
                </UBadge>
              </div>
              <code class="mt-1 block font-mono text-xs text-muted">{{ key.start }}</code>
              <p class="mt-1 text-xs text-muted">
                {{ $t('settings.apiKeys.games') }}: {{ gamesLabel(key.permissions) }}
              </p>
              <p class="mt-1 text-xs text-muted">
                {{ $t('settings.apiKeys.createdAt') }}: {{ formatDate(key.createdAt) }}
              </p>
              <p class="mt-0.5 text-xs text-muted">
                {{ $t('settings.apiKeys.lastUsed') }}: {{ key.lastRequest ? formatDate(key.lastRequest) : '—' }}
              </p>
            </div>
            <UButton color="error" variant="soft" icon="i-lucide-trash" size="sm" :loading="deletingId === key.id" @click="deleteKey(key.id)">
              {{ $t('settings.apiKeys.delete') }}
            </UButton>
          </div>
        </UCard>

        <p v-if="apiKeys.length === 0" class="text-center text-sm text-muted">{{ $t('settings.apiKeys.empty') }}</p>
      </div>
    </div>

    <ApiKeyCreateDialog v-model:open="showCreateDialog" @created="loadKeys" />
  </div>
</template>

<script setup lang="ts">
import { authClient } from '../composables/auth';

const { t } = useI18n();
const toast = useToast();

useTitle(() => t('nav.settings'));

const session = authClient.useSession();
const showCreateDialog = ref(false);

const openCreateDialog = () => {
  showCreateDialog.value = true;
};

// ── Login / logout ──
const loginEmail = ref('');
const loginPassword = ref('');
const loginError = ref<string | null>(null);
const loggingIn = ref(false);

const login = async () => {
  if (!loginEmail.value || !loginPassword.value) return;
  loggingIn.value = true;
  loginError.value = null;

  const { error } = await authClient.signIn.email({
    email:    loginEmail.value,
    password: loginPassword.value,
  });

  loggingIn.value = false;

  if (error) {
    loginError.value = error.message ?? t('settings.loginFailed');
  } else {
    loginEmail.value = '';
    loginPassword.value = '';
    toast.add({ title: t('settings.loginSuccess'), color: 'success' });
  }
};

const loggingOut = ref(false);

const logout = async () => {
  loggingOut.value = true;
  await authClient.signOut();
  loggingOut.value = false;
  toast.add({ title: t('settings.logoutSuccess'), color: 'success' });
};

// ── API keys ──
type ApiKeyItem = {
  id:          string;
  name:        string | null;
  start:       string | null;
  enabled:     boolean;
  createdAt:   Date | string;
  lastRequest: Date | string | null;
  expiresAt:   Date | string | null;
  permissions: Record<string, string[]> | null;
};

const apiKeys = ref<ApiKeyItem[]>([]);
const keyError = ref<string | null>(null);
const deletingId = ref<string | null>(null);

const gamesLabel = (permissions: Record<string, string[]> | null): string => {
  return permissions?.allowedGames?.join(', ') || '—';
};

const formatDate = (value: Date | string): string => {
  return new Date(value).toLocaleString();
};

const loadKeys = async () => {
  const { data, error } = await authClient.apiKey.list({ query: {} });

  if (error) {
    keyError.value = error.message ?? 'Failed to load keys';
    return;
  }

  apiKeys.value = (data?.apiKeys ?? []) as ApiKeyItem[];
};

const deleteKey = async (keyId: string) => {
  deletingId.value = keyId;

  const { error } = await authClient.apiKey.delete({ keyId });

  deletingId.value = null;

  if (error) {
    toast.add({ title: error.message ?? 'Failed to delete key', color: 'error' });
    return;
  }

  toast.add({ title: t('settings.apiKeys.deleted'), color: 'success' });
  await loadKeys();
};

watch(() => session.value.data, async value => {
  if (value) {
    await loadKeys();
  } else {
    apiKeys.value = [];
  }
}, { immediate: true });
</script>
