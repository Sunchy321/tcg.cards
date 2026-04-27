import { invoke } from "@tauri-apps/api/core";

export interface DesktopAuthUser {
  id: string;
  name: string;
  email: string;
  username: string | null;
  role: string | null;
}

export interface DesktopAuthSession {
  id: string;
  expiresAt: string;
}

export interface DesktopAuthState {
  user: DesktopAuthUser;
  session: DesktopAuthSession;
}

export const internalAuthURL = import.meta.env.VITE_INTERNAL_AUTH_URL ?? "http://localhost:2998";

export function signIn(input: { username: string; password: string }) {
  return invoke<DesktopAuthState>("auth_sign_in", {
    baseUrl: internalAuthURL,
    username: input.username,
    password: input.password,
  });
}

export function getSession() {
  return invoke<DesktopAuthState | null>("auth_get_session");
}

export function signOut() {
  return invoke("auth_sign_out");
}
