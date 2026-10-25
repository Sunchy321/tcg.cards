import type { RemoteAuthStatus } from '../../electron/contract';

const status = ref<RemoteAuthStatus | null>(null);

/** Refreshes the local session view; expiry is judged without contacting the backend. */
async function refresh(): Promise<RemoteAuthStatus> {
  status.value = await window.desktop.auth.status();
  return status.value;
}

/** Gate for operations that touch the remote console; guides to the login page when needed. */
async function requireSession(): Promise<boolean> {
  const current = await refresh();
  if (current.loggedIn) return true;
  const returnTo = useRoute().fullPath;
  useToast().add({
    title:       '此操作需要先登录',
    description: '登录后将返回当前操作。',
    color:       'warning',
    duration:    0,
    actions:     [{
      label:   '去登录',
      onClick: () => {
        void navigateTo({ path: '/settings/remote', query: { return: returnTo } });
      },
    }],
  });
  return false;
}

/** Shared remote-session state for the settings page and gated operations. */
export function useRemoteSession() {
  return { status, refresh, requireSession };
}
