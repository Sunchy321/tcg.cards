<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isAdminRole } from "@tcg-cards/auth";

import { getSession, internalAuthURL, signIn, signOut, type DesktopAuthState } from "./auth";
import { ensureLoginWindow, ensureMainWindow } from "./windows";

const form = reactive({
  username: "",
  password: "",
});

const currentWindow = getCurrentWindow();
const isLoginWindow = currentWindow.label === "login";

const loading = ref(true);
const submitting = ref(false);
const errorMsg = ref("");
const session = ref<DesktopAuthState | null>(null);

const role = computed(() => session.value?.user.role ?? null);
const hasAdminAccess = computed(() => isAdminRole(role.value));
const sessionName = computed(() => session.value?.user.name ?? "Console User");
const userInitial = computed(() => sessionName.value.slice(0, 1).toUpperCase());

async function switchToMainWindow() {
  await ensureMainWindow();
  await currentWindow.close();
}

async function switchToLoginWindow() {
  await ensureLoginWindow();
  await currentWindow.close();
}

async function refreshSession() {
  loading.value = true;
  errorMsg.value = "";

  try {
    const nextSession = await getSession();

    if (!nextSession) {
      session.value = null;

      if (!isLoginWindow) {
        await switchToLoginWindow();
      }

      return;
    }

    if (!isAdminRole(nextSession.user.role)) {
      await signOut();
      session.value = null;

      if (isLoginWindow) {
        errorMsg.value = "Admin role is required to access the desktop console.";
      } else {
        await switchToLoginWindow();
      }

      return;
    }

    session.value = nextSession;

    if (isLoginWindow) {
      await switchToMainWindow();
    }
  } catch (error) {
    errorMsg.value = error instanceof Error ? error.message : "Failed to restore session";
  } finally {
    loading.value = false;
  }
}

async function handleSignIn() {
  submitting.value = true;
  errorMsg.value = "";

  try {
    const nextSession = await signIn(form);

    if (!isAdminRole(nextSession.user.role)) {
      await signOut();
      session.value = null;
      errorMsg.value = "Admin role is required to access the desktop console.";
      return;
    }

    session.value = nextSession;
    form.password = "";
    await switchToMainWindow();
  } catch (error) {
    errorMsg.value = error instanceof Error ? error.message : "Failed to sign in";
  } finally {
    submitting.value = false;
  }
}

async function handleSignOut() {
  submitting.value = true;
  errorMsg.value = "";

  try {
    await signOut();
    session.value = null;
    await switchToLoginWindow();
  } catch (error) {
    errorMsg.value = error instanceof Error ? error.message : "Failed to sign out";
  } finally {
    submitting.value = false;
  }
}

onMounted(() => {
  void refreshSession();
});
</script>

<template>
  <main
    v-if="isLoginWindow"
    class="relative min-h-screen overflow-hidden bg-slate-50 text-slate-950"
  >
    <div class="absolute inset-x-0 top-0 h-40 bg-linear-to-r from-console-100 via-white to-console-50" />
    <div class="absolute inset-x-0 top-0 h-px bg-console-200/70" />

    <div class="relative mx-auto flex min-h-screen w-full max-w-6xl items-center px-6 py-10">
      <section class="grid w-full gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <div class="flex flex-col justify-between rounded-[28px] border border-slate-200 bg-white p-8 shadow-[0_24px_60px_rgba(15,23,42,0.08)] lg:p-10">
          <div class="space-y-8">
            <div class="flex items-center gap-3">
              <div class="flex h-11 w-11 items-center justify-center rounded-2xl bg-console-600 text-sm font-semibold text-white shadow-sm">
                CC
              </div>
              <div>
                <p class="text-sm font-semibold text-slate-900">Console Desktop</p>
                <p class="text-sm text-slate-500">Internal administration shell</p>
              </div>
            </div>

            <div class="space-y-4">
              <p class="text-xs font-semibold uppercase tracking-[0.18em] text-console-600">
                Desktop Sign In
              </p>
              <h1 class="max-w-xl text-4xl font-semibold tracking-tight text-slate-950 lg:text-5xl">
                Access the console through the shared internal auth service.
              </h1>
              <p class="max-w-xl text-base leading-7 text-slate-600">
                The desktop app follows the same product tone as the web console while keeping authentication
                and session restore inside the Tauri runtime.
              </p>
            </div>
          </div>

          <div class="grid gap-3 sm:grid-cols-2">
            <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p class="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">Session Restore</p>
              <p class="mt-2 text-sm text-slate-700">
                Relaunch resumes the last valid Better Auth session without another password prompt.
              </p>
            </div>
            <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p class="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">Auth Endpoint</p>
              <p class="mt-2 break-all font-mono text-xs text-slate-700">{{ internalAuthURL }}/auth</p>
            </div>
          </div>
        </div>

        <section class="rounded-[28px] border border-slate-200 bg-white p-7 shadow-[0_24px_60px_rgba(15,23,42,0.08)] lg:p-8">
          <div class="mb-6 flex items-center justify-between">
            <div>
              <p class="text-xs font-semibold uppercase tracking-[0.18em] text-console-600">Authentication</p>
              <h2 class="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Sign in</h2>
            </div>
            <div class="rounded-full border border-console-200 bg-console-50 px-3 py-1 text-xs font-medium text-console-700">
              Admin only
            </div>
          </div>

          <div
            v-if="loading"
            class="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600"
          >
            Checking current session...
          </div>

          <template v-else>
            <form class="space-y-4" @submit.prevent="handleSignIn">
              <label class="block space-y-2">
                <span class="text-sm font-medium text-slate-700">Username</span>
                <input
                  v-model="form.username"
                  autocomplete="username"
                  required
                  class="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-console-400 focus:ring-4 focus:ring-console-100"
                />
              </label>

              <label class="block space-y-2">
                <span class="text-sm font-medium text-slate-700">Password</span>
                <input
                  v-model="form.password"
                  type="password"
                  autocomplete="current-password"
                  required
                  class="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-console-400 focus:ring-4 focus:ring-console-100"
                />
              </label>

              <div
                v-if="errorMsg"
                class="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
              >
                {{ errorMsg }}
              </div>

              <button
                type="submit"
                :disabled="submitting"
                class="inline-flex w-full items-center justify-center rounded-2xl bg-console-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-console-700 disabled:cursor-wait disabled:bg-console-400"
              >
                {{ submitting ? "Signing In..." : "Sign In" }}
              </button>
            </form>
          </template>
        </section>
      </section>
    </div>
  </main>

  <main
    v-else
    class="flex min-h-screen overflow-hidden bg-slate-50 text-slate-950"
  >
    <aside class="flex w-72 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div class="flex h-16 items-center gap-3 border-b border-slate-200 px-6">
        <div class="flex h-10 w-10 items-center justify-center rounded-2xl bg-console-600 text-sm font-semibold text-white">
          CC
        </div>
        <div>
          <p class="text-sm font-semibold text-slate-900">Console Desktop</p>
          <p class="text-xs text-slate-500">Desktop administration</p>
        </div>
      </div>

      <nav class="flex-1 space-y-6 overflow-y-auto px-4 py-5">
        <section class="space-y-2">
          <p class="px-2 text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Workspace</p>
          <div class="rounded-2xl bg-console-50 px-4 py-3 text-sm text-console-900 ring-1 ring-console-100">
            <p class="font-semibold">Overview</p>
            <p class="mt-1 text-xs text-console-700">Current authenticated desktop shell</p>
          </div>
          <div class="rounded-2xl px-4 py-3 text-sm text-slate-600 ring-1 ring-slate-200">
            <p class="font-semibold text-slate-900">Session</p>
            <p class="mt-1 text-xs text-slate-500">Persisted between app launches</p>
          </div>
        </section>

        <section class="space-y-2">
          <p class="px-2 text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Access</p>
          <div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <p class="text-sm font-semibold text-slate-900">Role scope</p>
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
        <button
          :disabled="submitting"
          class="inline-flex w-full items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-wait disabled:text-slate-400"
          @click="handleSignOut"
        >
          Sign Out
        </button>
      </div>
    </aside>

    <div class="flex min-w-0 flex-1 flex-col">
      <header class="flex h-16 items-center gap-4 border-b border-slate-200 bg-white px-8">
        <div class="flex-1">
          <p class="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Console</p>
          <h1 class="mt-1 text-lg font-semibold text-slate-950">Desktop session overview</h1>
        </div>

        <template v-if="session">
          <div class="hidden text-right md:block">
            <p class="text-sm font-medium text-slate-900">{{ session.user.email }}</p>
            <p class="text-xs text-slate-500">{{ session.user.username ?? "No username" }}</p>
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
          <p class="text-sm text-slate-500">Loading session...</p>
        </section>

        <template v-else-if="session">
          <section class="rounded-[28px] border border-slate-200 bg-white p-8 shadow-[0_20px_50px_rgba(15,23,42,0.06)]">
            <div class="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
              <div class="max-w-3xl">
                <p class="text-xs font-semibold uppercase tracking-[0.18em] text-console-600">Authenticated</p>
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
                <button
                  :disabled="submitting"
                  class="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-wait disabled:text-slate-400"
                  @click="refreshSession"
                >
                  Refresh Session
                </button>
              </div>
            </div>
          </section>

          <section class="mt-6 grid gap-4 xl:grid-cols-4">
            <article class="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
              <p class="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Username</p>
              <p class="mt-3 break-words text-sm font-semibold text-slate-900">
                {{ session.user.username ?? "Not set" }}
              </p>
            </article>

            <article class="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
              <p class="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Email</p>
              <p class="mt-3 break-words text-sm font-semibold text-slate-900">{{ session.user.email }}</p>
            </article>

            <article class="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
              <p class="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Session ID</p>
              <p class="mt-3 break-words font-mono text-xs text-slate-700">{{ session.session.id }}</p>
            </article>

            <article class="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
              <p class="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Expires</p>
              <p class="mt-3 break-words text-sm font-semibold text-slate-900">{{ session.session.expiresAt }}</p>
            </article>
          </section>

          <section class="mt-6 grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
            <article class="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
              <p class="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Desktop Auth Notes</p>
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
              <p class="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Connection</p>
              <dl class="mt-4 space-y-4">
                <div>
                  <dt class="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Service URL</dt>
                  <dd class="mt-2 break-all font-mono text-xs text-slate-700">{{ internalAuthURL }}</dd>
                </div>
                <div>
                  <dt class="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Window State</dt>
                  <dd class="mt-2 text-sm font-medium text-slate-900">Main window opens maximized</dd>
                </div>
              </dl>
            </article>
          </section>
        </template>

        <section
          v-else
          class="rounded-[28px] border border-slate-200 bg-white p-8 shadow-[0_20px_50px_rgba(15,23,42,0.06)]"
        >
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Session</p>
          <h2 class="mt-3 text-2xl font-semibold tracking-tight text-slate-950">Session unavailable</h2>
          <p class="mt-3 max-w-2xl text-sm leading-7 text-slate-600">
            The main window could not restore the current desktop session. Retry to fetch the latest auth state.
          </p>
          <div class="mt-6">
            <button
              :disabled="submitting"
              class="inline-flex items-center justify-center rounded-2xl bg-console-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-console-700 disabled:cursor-wait disabled:bg-console-400"
              @click="refreshSession"
            >
              Retry
            </button>
          </div>
        </section>

        <div
          v-if="errorMsg"
          class="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
        >
          {{ errorMsg }}
        </div>
      </div>
    </div>
  </main>
</template>
