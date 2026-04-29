<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { isAdminRole } from '@tcg-cards/auth';

import { currentAuthState, getSession, signIn, signOut } from '../auth';
import { ensureMainWindow } from '../windows';

const STORED_USERNAME_KEY = 'console-desktop-username';

const form = reactive({
  username: localStorage.getItem(STORED_USERNAME_KEY) ?? '',
  password: '',
});

const loading = ref(true);
const submitting = ref(false);
const errorMsg = ref('');

async function tryLoadSavedPassword(username: string) {
  if (!username) return;

  try {
    const password = await invoke<string | null>('credential_get', { username });
    if (password) form.password = password;
  } catch {
    // Credential store unavailable — ignore
  }
}

async function switchToMainWindow() {
  await ensureMainWindow();
  await getCurrentWindow().close();
}

async function handleSignIn() {
  submitting.value = true;
  errorMsg.value = '';

  try {
    const session = await signIn({
      username: form.username,
      password: form.password,
    });

    if (!isAdminRole(session.user.role)) {
      await signOut();
      errorMsg.value = 'Admin role is required to access the desktop console.';
      return;
    }

    currentAuthState.value = session;

    // Persist credentials
    localStorage.setItem(STORED_USERNAME_KEY, form.username);
    try {
      await invoke('credential_set', { username: form.username, password: form.password });
    } catch {
      // Credential store unavailable — ignore
    }

    form.password = '';
    await switchToMainWindow();
  } catch (error) {
    errorMsg.value = error instanceof Error ? error.message : String(error);
  } finally {
    submitting.value = false;
  }
}

onMounted(async () => {
  await tryLoadSavedPassword(form.username);

  try {
    const session = await getSession();

    if (!session) {
      return;
    }

    if (!isAdminRole(session.user.role)) {
      await signOut();
      errorMsg.value = 'Admin role is required to access the desktop console.';
      return;
    }

    currentAuthState.value = session;

    // Already authenticated — go straight to main window
    await switchToMainWindow();
  } catch (error) {
    errorMsg.value = error instanceof Error ? error.message : String(error);
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <main class="h-screen overflow-hidden">
    <UCard
      :ui="{ root: 'h-full w-full rounded-none ring-0', body: 'h-full flex flex-col gap-3 py-6 justify-center' }"
    >
      <div
        v-if="loading"
        class="flex items-center gap-2 py-2 text-sm text-gray-500 dark:text-gray-400"
      >
        <UIcon
          name="i-lucide-loader-circle"
          class="size-4 animate-spin"
        />
        <span>正在恢复会话...</span>
      </div>

      <form
        v-else
        class="space-y-4"
        @submit.prevent="handleSignIn"
      >
        <UFormField
          label="用户名"
          name="username"
        >
          <UInput
            v-model="form.username"
            autocomplete="username"
            placeholder="请输入用户名"
            icon="i-lucide-user"
            required
            class="w-full"
          />
        </UFormField>

        <UFormField
          label="密码"
          name="password"
        >
          <UInput
            v-model="form.password"
            type="password"
            autocomplete="current-password"
            placeholder="请输入密码"
            icon="i-lucide-lock"
            required
            class="w-full"
          />
        </UFormField>

        <div class="h-16">
          <UAlert
            v-if="errorMsg"
            color="error"
            variant="soft"
            :description="errorMsg"
            icon="i-lucide-circle-alert"
          />
        </div>

        <UButton
          type="submit"
          label="登录"
          class="w-full justify-center"
          :loading="submitting"
        />
      </form>
    </UCard>
  </main>
</template>
