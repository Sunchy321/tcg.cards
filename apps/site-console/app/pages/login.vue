<template>
  <div class="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
    <UCard class="w-full max-w-sm">
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-layout-dashboard" class="size-5 text-primary" />
          <span class="text-base font-semibold">Console 登录</span>
        </div>
      </template>

      <UForm :schema="schema" :state="state" class="space-y-4" @submit="onSubmit">
        <UFormField label="用户名" name="username">
          <UInput
            v-model="state.username"
            placeholder="请输入用户名"
            icon="i-lucide-user"
            class="w-full"
          />
        </UFormField>

        <UFormField label="密码" name="password">
          <UInput
            v-model="state.password"
            type="password"
            placeholder="请输入密码"
            icon="i-lucide-lock"
            class="w-full"
          />
        </UFormField>

        <UAlert
          v-if="errorMsg"
          color="error"
          variant="soft"
          :description="errorMsg"
          icon="i-lucide-circle-alert"
        />

        <UButton
          type="submit"
          label="登录"
          class="w-full justify-center"
          :loading="loading"
        />
      </UForm>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import { z } from 'zod';
import { authClient, isAdminRole } from '~/composables/auth';

definePageMeta({ layout: false });

const schema = z.object({
  username: z.string().min(1, '请输入用户名'),
  password: z.string().min(1, '请输入密码'),
});

type Schema = z.output<typeof schema>;

const state = reactive<Schema>({
  username: '',
  password: '',
});

const loading = ref(false);
const errorMsg = ref('');

async function onSubmit() {
  loading.value = true;
  errorMsg.value = '';

  try {
    const { data, error } = await authClient.signIn.username({
      username: state.username,
      password: state.password,
    });

    if (error || !data) {
      errorMsg.value = error?.message ?? '登录失败，请检查用户名和密码';
      return;
    }

    const role = (data.user as { role?: string }).role;

    if (!isAdminRole(role)) {
      await authClient.signOut();
      errorMsg.value = '权限不足，需要 admin 及以上权限才能访问';
      return;
    }

    await navigateTo('/');
  } catch {
    errorMsg.value = '登录时发生错误，请稍后重试';
  } finally {
    loading.value = false;
  }
}
</script>
