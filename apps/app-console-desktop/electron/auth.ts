import { ipcMain } from 'electron';
import { z } from 'zod';

import { AUTH_CHANNEL, type AuthRequest } from './contract.ts';
import { authListMagicRuleFiles, authLogin, authLogout, authProfile, authStatus } from './auth-core.ts';
import type { Settings } from './settings.ts';
import type { IpcMainInvokeEvent } from 'electron';

const request = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('status') }),
  z.strictObject({ action: z.literal('profile') }),
  z.strictObject({ action: z.literal('listMagicRuleFiles') }),
  z.strictObject({
    action:   z.literal('login'),
    baseUrl:  z.string().trim().min(1).max(2_048),
    username: z.string().min(1).max(256),
    password: z.string().min(1).max(256),
  }),
  z.strictObject({ action: z.literal('logout') }),
]);

/** Registers the remote-session gateway; every action stays behind renderer authorization. */
export function registerAuth(
  settings: Settings,
  authorize: (event: IpcMainInvokeEvent) => Promise<void>,
) {
  ipcMain.handle(AUTH_CHANNEL, async (event, input: AuthRequest) => {
    await authorize(event);
    const parsed = request.safeParse(input);
    if (!parsed.success) throw new Error('登录操作无效。');
    const value = parsed.data;
    switch (value.action) {
    case 'status':
      return authStatus(settings);
    case 'profile':
      return authProfile(settings);
    case 'listMagicRuleFiles':
      return authListMagicRuleFiles(settings);
    case 'login':
      return authLogin(settings, value.baseUrl, value.username, value.password);
    case 'logout':
      return authLogout(settings);
    }
  });
}
