<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { isAdminRole } from '@tcg-cards/auth';
import {
  canManageUsers,
  getAccessibleGames,
  getGameNavItems,
  getGameSelectItems,
  getUserNavItems,
  resolveGameFromPath,
  type Game,
} from '@tcg-cards/app-console';

import { currentAuthState, getSession, signOut } from '../auth';
import { ensureLoginWindow } from '../windows';

const route = useRoute();

const loading = ref(true);
const submitting = ref(false);
const errorMsg = ref('');

const session = computed(() => currentAuthState.value);
const userRole = computed(() => session.value?.user.role ?? null);
const userName = computed(() => session.value?.user.name ?? 'Console User');
const userInitial = computed(() => userName.value.slice(0, 1).toUpperCase());
const accessibleGames = computed(() => getAccessibleGames(userRole.value));
const showUserManagement = computed(() => canManageUsers(userRole.value));
const gameSelectItems = computed(() => getGameSelectItems(accessibleGames.value));

const currentGame = ref<Game | null>(null);
const navItems = computed(() => currentGame.value ? getGameNavItems(currentGame.value) : []);
const userNavItems = computed(() => getUserNavItems());

function resolveActiveGame() {
  const fromPath = resolveGameFromPath(route.path);
  if (fromPath && accessibleGames.value.includes(fromPath)) {
    currentGame.value = fromPath;
  } else if (accessibleGames.value.length > 0 && !currentGame.value) {
    currentGame.value = accessibleGames.value[0]!;
  }
}

async function switchToLoginWindow() {
  await ensureLoginWindow();
  await getCurrentWindow().close();
}

async function refreshSession() {
  loading.value = true;
  errorMsg.value = '';

  try {
    const next = await getSession();

    if (!next) {
      currentAuthState.value = null;
      await switchToLoginWindow();
      return;
    }

    if (!isAdminRole(next.user.role)) {
      await signOut();
      currentAuthState.value = null;
      await switchToLoginWindow();
      return;
    }

    currentAuthState.value = next;
    resolveActiveGame();
  } catch (error) {
    errorMsg.value = error instanceof Error ? error.message : 'Failed to restore session';
  } finally {
    loading.value = false;
  }
}

async function handleSignOut() {
  submitting.value = true;
  errorMsg.value = '';

  try {
    await signOut();
    currentAuthState.value = null;
    await switchToLoginWindow();
  } catch (error) {
    errorMsg.value = error instanceof Error ? error.message : 'Failed to sign out';
  } finally {
    submitting.value = false;
  }
}

function handleGameSelect(value: string) {
  currentGame.value = value as Game;
}

onMounted(async () => {
  await refreshSession();
});
</script>

<template>
  <main class="flex h-screen overflow-hidden bg-default text-default">
    <!-- Sidebar -->
    <aside class="flex w-56 shrink-0 flex-col border-r border-default bg-elevated/80 backdrop-blur">
      <!-- Logo -->
      <div class="flex h-12 items-center gap-3 border-b border-default px-4">
        <div class="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-600 text-xs font-bold text-white">
          CC
        </div>
        <span class="text-sm font-semibold text-default">Console Desktop</span>
      </div>

      <!-- Nav -->
      <nav class="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        <!-- Game selector -->
        <div v-if="accessibleGames.length > 0" class="px-1 pb-2">
          <USelect
            :model-value="currentGame ?? undefined"
            :items="gameSelectItems"
            size="sm"
            @update:model-value="handleGameSelect($event as string)"
          />
        </div>

        <!-- Game nav items -->
        <template v-if="currentGame && navItems.length > 0">
          <template v-for="(group, gi) in navItems" :key="gi">
            <RouterLink
              v-for="item in group"
              :key="item.to"
              :to="item.to"
              custom
              v-slot="{ isActive, navigate }"
            >
              <button
                class="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-colors"
                :class="isActive
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted hover:bg-elevated hover:text-default'"
                @click="navigate"
              >
                <UIcon :name="item.icon" class="size-4 shrink-0" />
                {{ item.label }}
              </button>
            </RouterLink>
          </template>
        </template>

        <!-- Divider -->
        <div class="my-1.5 border-t border-default" />

        <!-- User management nav -->
        <template v-if="showUserManagement">
          <template v-for="(group, gi) in userNavItems" :key="gi">
            <RouterLink
              v-for="item in group"
              :key="item.to"
              :to="item.to"
              custom
              v-slot="{ isActive, navigate }"
            >
              <button
                class="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-colors"
                :class="isActive
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted hover:bg-elevated hover:text-default'"
                @click="navigate"
              >
                <UIcon :name="item.icon" class="size-4 shrink-0" />
                {{ item.label }}
              </button>
            </RouterLink>
          </template>
        </template>

        <!-- Settings -->
        <RouterLink
          to="/settings"
          custom
          v-slot="{ isActive, navigate }"
        >
          <button
            class="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-colors"
            :class="isActive
              ? 'bg-primary/10 text-primary font-medium'
              : 'text-muted hover:bg-elevated hover:text-default'"
            @click="navigate"
          >
            <UIcon name="i-lucide-settings" class="size-4 shrink-0" />
            设置
          </button>
        </RouterLink>
      </nav>

      <!-- User footer -->
      <div class="border-t border-default p-2.5">
        <div class="flex items-center gap-2.5">
          <div class="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary shrink-0">
            {{ userInitial }}
          </div>
          <div class="flex-1 min-w-0">
            <p class="truncate text-xs font-medium text-default">{{ userName }}</p>
            <p class="truncate text-xs text-muted">{{ session?.user.email }}</p>
          </div>
          <UButton
            icon="i-lucide-log-out"
            color="neutral"
            variant="ghost"
            size="xs"
            :loading="submitting"
            @click="handleSignOut"
          />
        </div>
      </div>
    </aside>

    <!-- Main content -->
    <div class="flex min-w-0 flex-1 flex-col overflow-hidden">
      <div v-if="loading" class="flex flex-1 items-center justify-center">
        <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin text-muted" />
      </div>

      <RouterView v-else-if="session" />

      <div v-else class="flex flex-1 flex-col items-center justify-center gap-4 text-muted">
        <UIcon name="i-lucide-lock" class="size-10" />
        <p class="text-sm">Session unavailable</p>
        <UButton label="Retry" :loading="loading" @click="refreshSession" />
      </div>

      <UAlert
        v-if="errorMsg"
        color="error"
        variant="soft"
        :description="errorMsg"
        icon="i-lucide-circle-alert"
        class="m-4"
      />
    </div>
  </main>
</template>
