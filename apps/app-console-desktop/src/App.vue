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
  <main v-if="isLoginWindow" class="login-shell">
    <section class="login-card">
      <p class="eyebrow">Desktop Console</p>
      <h1>Sign in with the internal service.</h1>
      <p class="lede">
        Authentication is handled by
        <code>{{ internalAuthURL }}</code>
        and the Better Auth session stays inside the Tauri runtime.
      </p>

      <template v-if="loading">
        <p class="status">Checking current session...</p>
      </template>

      <template v-else>
        <form class="form" @submit.prevent="handleSignIn">
          <label class="field">
            <span>Username</span>
            <input v-model="form.username" autocomplete="username" required />
          </label>

          <label class="field">
            <span>Password</span>
            <input
              v-model="form.password"
              type="password"
              autocomplete="current-password"
              required
            />
          </label>

          <button type="submit" :disabled="submitting">
            {{ submitting ? "Signing In..." : "Sign In" }}
          </button>
        </form>
      </template>

      <p v-if="errorMsg" class="error">{{ errorMsg }}</p>
    </section>
  </main>

  <main v-else class="main-shell">
    <template v-if="loading">
      <section class="status-card">
        <p class="eyebrow">Desktop Console</p>
        <h1>Loading session...</h1>
      </section>
    </template>

    <template v-else-if="session">
      <section class="hero-card">
        <div>
          <p class="eyebrow">Main Window</p>
          <h1>{{ session.user.name }}</h1>
          <p class="lede">Signed in through `service-internal` with a Rust-managed Better Auth session.</p>
        </div>

        <div class="toolbar">
          <span class="badge" :class="{ danger: !hasAdminAccess }">
            {{ session.user.role ?? "user" }}
          </span>
          <button class="secondary" :disabled="submitting" @click="refreshSession">
            Refresh Session
          </button>
          <button :disabled="submitting" @click="handleSignOut">Sign Out</button>
        </div>
      </section>

      <section class="facts-grid">
        <article class="fact-card">
          <p class="label">Username</p>
          <p class="value">{{ session.user.username ?? "—" }}</p>
        </article>

        <article class="fact-card">
          <p class="label">Email</p>
          <p class="value">{{ session.user.email }}</p>
        </article>

        <article class="fact-card">
          <p class="label">Session ID</p>
          <p class="value">{{ session.session.id }}</p>
        </article>

        <article class="fact-card">
          <p class="label">Expires</p>
          <p class="value">{{ session.session.expiresAt }}</p>
        </article>
      </section>
    </template>

    <template v-else>
      <section class="status-card">
        <p class="eyebrow">Desktop Console</p>
        <h1>Session unavailable.</h1>
        <p class="lede">The main window could not restore the current login state.</p>
        <div class="toolbar">
          <button class="secondary" :disabled="submitting" @click="refreshSession">
            Retry
          </button>
        </div>
      </section>
    </template>

    <p v-if="errorMsg" class="error floating-error">{{ errorMsg }}</p>
  </main>
</template>
