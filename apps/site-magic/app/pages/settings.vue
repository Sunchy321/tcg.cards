<template>
  <!--
    Desktop : 2-column grid  [220px sidebar | 1fr content]
    Mobile  : stacked        [user card → tab pills → content]
  -->
  <div class="lg:grid lg:grid-cols-[220px_1fr] lg:gap-6 flex flex-col gap-4 lg:items-start">

    <!-- ── Left sidebar ── -->
    <aside class="flex flex-col gap-3 lg:sticky lg:top-[calc(var(--ui-header-height,56px)+1.5rem)]">

      <!-- User card / quick login -->
      <UCard>

        <!-- Logged in -->
        <template v-if="session.data">
          <div class="flex flex-col gap-3">
            <div class="flex items-center gap-3 min-w-0">
              <UAvatar
                :alt="session.data.user.name ?? session.data.user.email"
                :src="session.data.user.image ?? undefined"
                size="md"
                class="shrink-0"
              />
              <div class="min-w-0">
                <div class="flex items-center gap-1.5 min-w-0">
                  <p class="text-gray-900 dark:text-white font-semibold text-sm truncate">
                    {{ session.data.user.name ?? session.data.user.email }}
                  </p>
                  <span :class="roleInfo.colorClass" class="shrink-0 inline-flex items-center text-xs font-medium px-1.5 py-0.5 rounded-md">
                    {{ roleInfo.label }}
                  </span>
                </div>
                <p class="text-gray-500 dark:text-gray-400 text-xs truncate">
                  {{ session.data.user.email }}
                </p>
              </div>
            </div>
            <UButton
              color="error"
              variant="soft"
              icon="lucide:log-out"
              size="sm"
              class="w-full justify-center"
              :loading="loggingOut"
              @click="logout"
            >
              {{ $t('settings.logout') }}
            </UButton>
          </div>
        </template>

        <!-- Not logged in: compact quick-login -->
        <template v-else>
          <form class="flex flex-col gap-2" @submit.prevent="login">
            <p class="text-gray-500 dark:text-gray-400 text-xs font-semibold uppercase tracking-wide mb-0.5">
              {{ $t('settings.login') }}
            </p>
            <UInput
              v-model="loginEmail"
              type="email"
              size="sm"
              autocomplete="email"
              :placeholder="$t('settings.emailPlaceholder')"
            />
            <UInput
              v-model="loginPassword"
              type="password"
              size="sm"
              autocomplete="current-password"
              :placeholder="$t('settings.passwordPlaceholder')"
            />
            <UAlert
              v-if="loginError"
              color="error"
              variant="soft"
              :description="loginError"
              class="text-xs py-1.5"
            />
            <UButton
              type="submit"
              color="primary"
              size="sm"
              class="w-full justify-center"
              :loading="loggingIn"
            >
              {{ $t('settings.login') }}
            </UButton>
            <NuxtLink
              to="/register"
              class="text-center text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-xs transition pt-0.5"
            >
              {{ $t('settings.createAccount') }} →
            </NuxtLink>
          </form>
        </template>
      </UCard>

      <!-- Vertical nav (desktop only) -->
      <nav class="hidden lg:flex flex-col gap-0.5">
        <button
          v-for="tab in settingsTabs"
          :key="tab.id"
          class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors w-full text-left"
          :class="activeTab === tab.id
            ? 'bg-white/20 text-white font-medium'
            : 'text-white/70 hover:bg-white/10 hover:text-white'"
          @click="activeTab = tab.id"
        >
          <UIcon :name="tab.icon" class="shrink-0 text-base" />
          {{ tab.label }}
        </button>
      </nav>
    </aside>

    <!-- ── Mobile horizontal tab bar (hidden on desktop) ── -->
    <div class="lg:hidden -mt-1">
      <UTabs
        v-model="activeTab"
        :items="settingsTabs.map(tab => ({ value: tab.id, label: tab.label, icon: tab.icon }))"
      />
    </div>

    <!-- ── Right content panel ── -->
    <div class="flex flex-col gap-4 min-w-0">

      <!-- General -->
      <template v-if="activeTab === 'general'">
        <SettingsCard :title="$t('settings.general.$self')">
          <template v-if="globalSyncStatus" #header-extra>
            <SyncStatusBadge :status="globalSyncStatus" />
          </template>
          <SettingsRow :label="$t('settings.general.uiLanguage')">
            <USelect
              v-model="appLocale"
              :items="appLocaleItems"
              class="w-44"
            />
          </SettingsRow>
          <USeparator />
          <SettingsRow :label="$t('settings.general.theme')">
            <USelect
              v-model="themeValue"
              :items="themeItems"
              class="w-44"
            />
          </SettingsRow>
        </SettingsCard>
      </template>

      <!-- Account -->
      <template v-else-if="activeTab === 'account'">
        <template v-if="session.data">
          <SettingsCard :title="$t('settings.account')">
            <!-- Display name -->
            <SettingsRow :label="$t('settings.displayName')">
              <div class="flex gap-2 flex-1">
                <UInput
                  v-model="displayName"
                  class="flex-1"
                  :placeholder="session.data.user.name ?? ''"
                />
                <UButton
                  color="neutral"
                  variant="solid"
                  :loading="updatingName"
                  :disabled="!displayName || displayName === session.data.user.name"
                  @click="updateDisplayName"
                >
                  {{ $t('settings.save') }}
                </UButton>
              </div>
            </SettingsRow>

            <USeparator />

            <!-- Change password -->
            <div class="flex flex-col gap-2">
              <p class="text-gray-700 dark:text-gray-300 text-sm font-medium">{{ $t('settings.changePassword') }}</p>
              <UInput
                v-model="currentPassword"
                type="password"
                :placeholder="$t('settings.currentPassword')"
              />
              <UInput
                v-model="newPassword"
                type="password"
                :placeholder="$t('settings.newPassword')"
              />
              <UButton
                color="neutral"
                variant="solid"
                class="self-start"
                :loading="updatingPassword"
                :disabled="!currentPassword || !newPassword"
                @click="updatePassword"
              >
                {{ $t('settings.changePassword') }}
              </UButton>
            </div>
          </SettingsCard>
        </template>

        <!-- Not logged in gate -->
        <template v-else>
          <UCard>
            <div class="flex flex-col items-center gap-3 py-8 text-center">
              <UIcon name="lucide:lock" class="text-gray-300 dark:text-gray-600 text-4xl" />
              <p class="text-gray-500 dark:text-gray-400 text-sm">{{ $t('settings.loginRequired') }}</p>
            </div>
          </UCard>
        </template>
      </template>

      <!-- Game -->
      <template v-else-if="activeTab === 'game'">
        <SettingsCard :title="$t('settings.game.$self')">
          <template v-if="gameSyncStatus" #header-extra>
            <SyncStatusBadge :status="gameSyncStatus" />
          </template>
          <SettingsRow :label="$t('settings.game.language')">
            <UDropdownMenu
              :items="gameLocaleItems"
              :ui="{ content: 'min-w-fit' }"
            >
              <UButton
                color="neutral"
                variant="outline"
                size="sm"
                class="w-44 justify-start"
              >
                {{ gameLocaleLabel }}
              </UButton>
              <template #locale-item="{ item }">
                <span class="font-mono shrink-0 min-w-10">{{ item.code }}</span>
                <span class="text-muted-foreground">{{ item.label }}</span>
              </template>
            </UDropdownMenu>
          </SettingsRow>
          <USeparator />
          <SettingsRow :label="$t('settings.game.searchLayout')">
            <div class="flex items-center gap-2">
              <USelect
                v-model="searchLayoutValue"
                :items="[
                  { value: 'grid', label: t('settings.game.searchLayoutGrid') },
                  { value: 'list', label: t('settings.game.searchLayoutList') },
                ]"
                class="w-44"
              />
              <UButton
                v-if="!isSearchLayoutDefault"
                variant="ghost"
                size="xs"
                @click="setSearchLayoutAsDefault"
              >
                {{ $t('settings.game.setAsDefault') }}
              </UButton>
              <UButton
                v-else
                variant="ghost"
                size="xs"
                :disabled="false"
                @click="resetSearchLayoutToDefault"
              >
                {{ $t('settings.game.resetToDefault') }}
              </UButton>
            </div>
          </SettingsRow>
        </SettingsCard>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'main' });

const { t, locale, setLocale, availableLocales } = useI18n();
const toast = useToast();
const appConfig = useAppConfig();

useTitle(() => t('settings.$self'));

const session = authClient.useSession();

// ── Role ─────────────────────────────────────────────────────────────────────

const roleInfo = computed(() => {
  const role = session.value.data?.user.role ?? 'user';
  const gameAdminRole = `admin/${appConfig.gameId as string}`;
  if (role === 'owner') {
    return { label: t('settings.role.owner'), colorClass: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' };
  }
  if (role === 'admin') {
    return { label: t('settings.role.admin'), colorClass: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' };
  }
  if (role === gameAdminRole) {
    return { label: t('settings.role.gameAdmin'), colorClass: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300' };
  }
  return { label: t('settings.role.user'), colorClass: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400' };
});

// ── Tabs ─────────────────────────────────────────────────────────────────────

const route = useRoute();
const router = useRouter();

const activeTab = computed({
  get: () => (route.query.tab as string) || 'general',
  set: val => router.replace({ query: { tab: val } }),
});

const settingsTabs = computed(() => [
  { id: 'general', label: t('settings.general.$self'), icon: 'lucide:sliders-horizontal' },
  { id: 'account', label: t('settings.account'), icon: 'lucide:user' },
  { id: 'game', label: t('settings.game.$self'), icon: 'lucide:gamepad-2' },
]);

// ── User config ────────────────────────────────────────────────────────────────

const { config: globalConfig, setConfig: setGlobalConfig, syncStatus: globalSyncStatus } = useGlobalConfig();
const { config: gameConfig, setConfig: setGameConfig, syncStatus: gameSyncStatus } = useUserConfig();

const appLocale = computed({
  get: () => globalConfig.value.lang,
  set: val => setGlobalConfig('lang', val),
});

watch(globalConfig, cfg => {
  if (cfg.lang !== locale.value) {
    setLocale(cfg.lang);
  }
}, { immediate: true });

// ── Theme ─────────────────────────────────────────────────────────────────────

const colorMode = useColorMode();
const themeValue = computed({
  get: () => colorMode.preference === 'system' ? 'auto' : colorMode.preference,
  set: val => {
    colorMode.preference = val === 'auto' ? 'system' : val;
    setGlobalConfig('theme', val);
  },
});
watch(() => globalConfig.value.theme, val => {
  themeValue.value = val;
}, { immediate: true });

// ── App locale items ───────────────────────────────────────────────────────────

const appLocaleItems = computed(() =>
  availableLocales.map(code => ({
    value: code,
    label: t(`lang.$self`, code, { locale: code }),
  })),
);

// ── Theme items ────────────────────────────────────────────────────────────────

const themeItems = computed(() => [
  { value: 'light', label: t('settings.general.themeLight') },
  { value: 'dark', label: t('settings.general.themeDark') },
  { value: 'auto', label: t('settings.general.themeAuto') },
]);

// ── Game locale items ──────────────────────────────────────────────────────────

const gameLocaleItems = computed(() =>
  (appConfig.locales as string[]).map((l: string) => ({
    code:     l,
    label:    t(`locale.${l}`, l),
    slot:     'locale-item' as const,
    onSelect: () => { setGameConfig('locale', l); },
  })),
);

const gameLocaleLabel = computed(() => {
  const l = gameConfig.value.locale as string;
  return t(`locale.${l}`, l);
});

// ── Search layout ──────────────────────────────────────────────────────────────

const searchLayoutValue = computed({
  get: () => gameConfig.value.searchLayout as string,
  set: val => setGameConfig('searchLayout', val),
});

const isSearchLayoutDefault = computed(() =>
  gameConfig.value.searchLayout === globalConfig.value.searchLayout,
);

function setSearchLayoutAsDefault() {
  setGlobalConfig('searchLayout', gameConfig.value.searchLayout);
}

function resetSearchLayoutToDefault() {
  setGameConfig('searchLayout', globalConfig.value.searchLayout);
}

// ── Login ─────────────────────────────────────────────────────────────────────

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

// ── Profile settings ──────────────────────────────────────────────────────────

const displayName = ref(session.value.data?.user.name ?? '');
const updatingName = ref(false);

const currentPassword = ref('');
const newPassword = ref('');
const updatingPassword = ref(false);

watch(() => session.value.data?.user.name, name => {
  if (name) displayName.value = name;
});

const updateDisplayName = async () => {
  updatingName.value = true;

  const { error } = await authClient.updateUser({ name: displayName.value });

  updatingName.value = false;

  if (error) {
    toast.add({ title: error.message ?? t('settings.updateFailed'), color: 'error' });
  } else {
    toast.add({ title: t('settings.updateSuccess'), color: 'success' });
  }
};

const updatePassword = async () => {
  updatingPassword.value = true;

  const { error } = await authClient.changePassword({
    currentPassword:     currentPassword.value,
    newPassword:         newPassword.value,
    revokeOtherSessions: false,
  });

  updatingPassword.value = false;

  if (error) {
    toast.add({ title: error.message ?? t('settings.updateFailed'), color: 'error' });
  } else {
    currentPassword.value = '';
    newPassword.value = '';
    toast.add({ title: t('settings.passwordUpdated'), color: 'success' });
  }
};

// ── Logout ────────────────────────────────────────────────────────────────────

const loggingOut = ref(false);

const logout = async () => {
  loggingOut.value = true;
  await authClient.signOut();
  loggingOut.value = false;
  toast.add({ title: t('settings.logoutSuccess'), color: 'success' });
};
</script>
