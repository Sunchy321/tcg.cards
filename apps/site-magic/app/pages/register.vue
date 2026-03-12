<template>
  <div class="max-w-md mx-auto w-full">
    <UCard>
      <template #header>
        <div class="flex items-center gap-3">
          <UButton
            icon="lucide:arrow-left"
            color="neutral"
            variant="ghost"
            size="sm"
            class="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 -ml-1"
            to="/settings"
          />
          <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
            {{ $t('settings.register') }}
          </h2>
        </div>
      </template>

      <form class="flex flex-col gap-4" @submit.prevent="register">
        <div class="flex flex-col gap-1.5">
          <label class="text-gray-700 dark:text-gray-300 text-sm font-medium">
            {{ $t('settings.displayName') }}
          </label>
          <UInput
            v-model="name"
            autocomplete="name"
            :placeholder="$t('settings.namePlaceholder')"
          />
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="text-gray-700 dark:text-gray-300 text-sm font-medium">
            {{ $t('settings.email') }}
          </label>
          <UInput
            v-model="email"
            type="email"
            autocomplete="email"
            :placeholder="$t('settings.emailPlaceholder')"
          />
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="text-gray-700 dark:text-gray-300 text-sm font-medium">
            {{ $t('settings.password') }}
          </label>
          <UInput
            v-model="password"
            type="password"
            autocomplete="new-password"
            :placeholder="$t('settings.newPasswordPlaceholder')"
          />
        </div>

        <UAlert
          v-if="error"
          color="error"
          variant="soft"
          :description="error"
        />

        <UButton
          type="submit"
          color="primary"
          class="w-full justify-center"
          :loading="loading"
        >
          {{ $t('settings.register') }}
        </UButton>

        <p class="text-center text-gray-400 dark:text-gray-500 text-sm">
          {{ $t('settings.alreadyHaveAccount') }}
          <NuxtLink
            to="/settings"
            class="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition underline underline-offset-2">
          >
            {{ $t('settings.login') }}
          </NuxtLink>
        </p>
      </form>
    </UCard>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'main' });

const { t } = useI18n();
useTitle(() => t('settings.register'));

const toast = useToast();
const router = useRouter();

const session = authClient.useSession();

watchEffect(() => {
  if (session.value.data != null) {
    router.replace('/settings');
  }
});

const name = ref('');
const email = ref('');
const password = ref('');
const error = ref<string | null>(null);
const loading = ref(false);

const register = async () => {
  if (!name.value || !email.value || !password.value) return;
  loading.value = true;
  error.value = null;

  const { error: err } = await authClient.signUp.email({
    name:     name.value,
    email:    email.value,
    password: password.value,
  });

  loading.value = false;

  if (err) {
    error.value = err.message ?? t('settings.registerFailed');
  } else {
    toast.add({ title: t('settings.registerSuccess'), color: 'success' });
    await router.push('/settings');
  }
};
</script>
