import { invoke } from '@tauri-apps/api/core';
import { ref } from 'vue';

export interface DesktopAuthUser {
  id:       string;
  name:     string;
  email:    string;
  username: string | null;
  role:     string | null;
}

export interface DesktopAuthSession {
  id:        string;
  expiresAt: string;
}

export interface DesktopAuthState {
  user:    DesktopAuthUser;
  session: DesktopAuthSession;
}

// Global reactive auth state shared across all components
export const currentAuthState = ref<DesktopAuthState | null>(null);

export function signIn(input: { username: string, password: string }) {
  return invoke<DesktopAuthState>('auth_sign_in', {
    username: input.username,
    password: input.password,
  });
}

export function getSession() {
  return invoke<DesktopAuthState | null>('auth_get_session');
}

export function signOut() {
  return invoke('auth_sign_out');
}
