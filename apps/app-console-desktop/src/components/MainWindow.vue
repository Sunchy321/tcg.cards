<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { isAdminRole } from '@tcg-cards/auth';

import { getSession, internalAuthURL, signOut, type DesktopAuthState } from '../auth';
import { ensureLoginWindow } from '../windows';

const loading = ref(true);
const submitting = ref(false);
const errorMsg = ref('');
const session = ref<DesktopAuthState | null>(null);

const hasAdminAccess = computed(() => isAdminRole(session.value?.user.role ?? null));
const sessionName = computed(() => session.value?.user.name ?? 'Console User');
const userInitial = computed(() => sessionName.value.slice(0, 1).toUpperCase());

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
      session.value = null;
      await switchToLoginWindow();
      return;
    }

    if (!isAdminRole(next.user.role)) {
      await signOut();
      session.value = null;
      await switchToLoginWindow();
      return;
    }

    session.value = next;
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
    session.value = null;
    await switchToLoginWindow();
  } catch (error) {
    errorMsg.value = error instanceof Error ? error.message : 'Failed to sign out';
  } finally {
    submitting.value = false;
  }
}

onMounted(() => {
  void refreshSession();
});
</script>

<template>
  <main class="flex min-h-screen overflow-hidden bg-slate-50 text-slate-950">
    <aside class="flex w-72 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div class="flex h-16 items-center gap-3 border-b border-slate-200 px-6">
        <div class="flex h-10 w-10 items-center justify-center rounded-2xl bg-console-600 text-sm font-semibold text-white">
          CC
        </div>
        <div>
          <p class="text-sm font-semibold text-slate-900">
            Console Desktop
          </p>
          <p class="text-xs text-slate-500">
            Desktop administration
          </p>
        </div>
      </div>

      <nav class="flex-1 space-y-6 overflow-y-auto px-4 py-5">
        <section class="space-y-2">
          <p class="px-2 text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
            Workspace
          </p>
          <div class="rounded-2xl bg-console-50 px-4 py-3 text-sm text-console-900 ring-1 ring-console-100">
            <p class="font-semibold">
              Overview
            </p>
            <p class="mt-1 text-xs text-console-700">
              Current authenticated desktop shell
            </p>
          </div>
          <div class="rounded-2xl px-4 py-3 text-sm text-slate-600 ring-1 ring-slate-200">
            <p class="font-semibold text-slate-900">
              Session
            </p>
            <p class="mt-1 text-xs text-slate-500">
              Persisted between app launches
            </p>
          </div>
        </section>

        <section class="space-y-2">
          <p class="px-2 text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
            Access
          </p>
          <div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <p class="text-sm font-semibold text-slate-900">
              Role scope
            </p>
            <div class="mt-3 flex items-center gap-2">
              <span
                class="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold"
                :class="hasAdminAccess ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'"
              >
                {{ hasAdminAccess ? "Admin access" : "Restricted" }}
              </span>
            </div>
            <p class="mt-3 text-xs leading-5 text-slate-500">
              Desktop access is granted only to admin-level accounts authenticated through `service-internal`.
            </p>
          </div>
        </section>
      </nav>

      <div class="border-t border-slate-200 p-4">
        <UButton
          color="neutral"
          variant="outline"
          label="Sign Out"
          class="w-full justify-center"
          :loading="submitting"
          @click="handleSignOut"
        />
      </div>
    </aside>

    <div class="flex min-w-0 flex-1 flex-col">
      <header class="flex h-16 items-center gap-4 border-b border-slate-200 bg-white px-8">
        <div class="flex-1">
          <p class="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
            Console
          </p>
          <h1 class="mt-1 text-lg font-semibold text-slate-950">
            Desktop session overview
          </h1>
        </div>

        <template v-if="session">
          <div class="hidden text-right md:block">
            <p class="text-sm font-medium text-slate-900">
              {{ session.user.email }}
            </p>
            <p class="text-xs text-slate-500">
              {{ session.user.username ?? "No username" }}
            </p>
          </div>
          <div class="flex h-11 w-11 items-center justify-center rounded-full bg-console-100 text-sm font-semibold text-console-700">
            {{ userInitial }}
          </div>
        </template>
      </header>

      <div class="flex-1 overflow-y-auto p-8">
        <section
          v-if="loading"
          class="rounded-[28px] border border-slate-200 bg-white p-8 shadow-[0_20px_50px_rgba(15,23,42,0.06)]"
        >
          <p class="text-sm text-slate-500">
            Loading session...
          </p>
        </section>

        <template v-else-if="session">
          <section class="rounded-[28px] border border-slate-200 bg-white p-8 shadow-[0_20px_50px_rgba(15,23,42,0.06)]">
            <div class="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
              <div class="max-w-3xl">
                <p class="text-xs font-semibold uppercase tracking-[0.18em] text-console-600">
                  Authenticated
                </p>
                <h2 class="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
                  {{ sessionName }}
                </h2>
                <p class="mt-3 text-sm leading-7 text-slate-600">
                  This desktop shell mirrors the same internal console language as the `site-*` products while
                  keeping session restore and auth requests inside Tauri.
                </p>
              </div>

              <div class="flex flex-wrap items-center gap-3">
                <span
                  class="inline-flex rounded-full px-3 py-1.5 text-xs font-semibold"
                  :class="hasAdminAccess ? 'bg-console-50 text-console-700 ring-1 ring-console-100' : 'bg-rose-50 text-rose-700 ring-1 ring-rose-100'"
                >
                  {{ session.user.role ?? "user" }}
                </span>
                <UButton
                  color="neutral"
                  variant="outline"
                  label="Refresh Session"
                  :loading="loading"
                  @click="refreshSession"
                />
              </div>
            </div>
          </section>

          <section class="mt-6 grid gap-4 xl:grid-cols-4">
            <article class="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
              <p class="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
                Username
              </p>
              <p class="mt-3 wrap-break-word text-sm font-semibold text-slate-900">
                {{ session.user.username ?? "Not set" }}
              </p>
            </article>

            <article class="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
              <p class="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
                Email
              </p>
              <p class="mt-3 wrap-break-word text-sm font-semibold text-slate-900">
                {{ session.user.email }}
              </p>
            </article>

            <article class="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
              <p class="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
                Session ID
              </p>
              <p class="mt-3 wrap-break-word font-mono text-xs text-slate-700">
                {{ session.session.id }}
              </p>
            </article>

            <article class="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
              <p class="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
                Expires
              </p>
              <p class="mt-3 wrap-break-word text-sm font-semibold text-slate-900">
                {{ session.session.expiresAt }}
              </p>
            </article>
          </section>

          <section class="mt-6 grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
            <article class="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
              <p class="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
                Desktop Auth Notes
              </p>
              <div class="mt-4 space-y-4 text-sm leading-7 text-slate-600">
                <p>
                  Authentication is proxied through the Rust runtime, so the desktop app does not rely on WebView
                  cookies or browser-managed session state.
                </p>
                <p>
                  A valid Better Auth session is restored on relaunch and revalidated against the internal service
                  before the main window is shown.
                </p>
              </div>
            </article>

            <article class="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
              <p class="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
                Connection
              </p>
              <dl class="mt-4 space-y-4">
                <div>
                  <dt class="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
                    Service URL
                  </dt>
                  <dd class="mt-2 wrap-break-word font-mono text-xs text-slate-700">
                    {{ internalAuthURL }}
                  </dd>
                </div>
                <div>
                  <dt class="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
                    Window State
                  </dt>
                  <dd class="mt-2 text-sm font-medium text-slate-900">
                    Main window opens maximized
                  </dd>
                </div>
              </dl>
            </article>
          </section>
        </template>

        <section
          v-else
          class="rounded-[28px] border border-slate-200 bg-white p-8 shadow-[0_20px_50px_rgba(15,23,42,0.06)]"
        >
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            Session
          </p>
          <h2 class="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
            Session unavailable
          </h2>
          <p class="mt-3 max-w-2xl text-sm leading-7 text-slate-600">
            The main window could not restore the current desktop session. Retry to fetch the latest auth state.
          </p>
          <div class="mt-6">
            <UButton
              color="primary"
              label="Retry"
              :loading="loading"
              @click="refreshSession"
            />
          </div>
        </section>

        <UAlert
          v-if="errorMsg"
          color="error"
          variant="soft"
          :description="errorMsg"
          icon="i-lucide-circle-alert"
          class="mt-4"
        />
      </div>
    </div>
  </main>
</template>
