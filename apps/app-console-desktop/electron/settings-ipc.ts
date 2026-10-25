import { dialog, ipcMain, shell } from 'electron';
import { dirname, isAbsolute } from 'node:path';
import { existsSync } from 'node:fs';
import { z } from 'zod';
import type { Settings } from './settings';
import { SETTINGS_CHANNEL, CLOSE_CHANNEL, type SettingsRequest, type CloseRequest } from './contract';
import { pathGroups } from '../shared/settings';
import type { BrowserWindow, IpcMainInvokeEvent } from 'electron';

/** Strict request validation prevents arbitrary filesystem and credential access. */
const request = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('read') }),
  z.strictObject({ action: z.literal('update'), key: z.string(), value: z.unknown() }),
  z.strictObject({
    action:   z.literal('json'),
    text:     z.string().max(1_000_000),
    revision: z.number().int().nonnegative(),
  }),
  z.strictObject({
    action: z.literal('secret'),
    key:    z.string().regex(/^(database|ai|remote-session|yugioh-publish|publish:[a-f0-9-]{36})$/),
    value:  z.string().max(65_536).nullable(),
  }),
  z.strictObject({ action: z.literal('directory'), current: z.string().nullable() }),
  z.strictObject({ action: z.literal('openDirectory') }),
  z.strictObject({ action: z.literal('paths'), game: z.enum(['magic', 'hearthstone']) }),
]);
/** Registers the restricted settings gateway after the app and stores are ready. */
export function registerSettings(
  settings: Settings,
  file: string,
  window: () => BrowserWindow | null,
  authorize: (event: IpcMainInvokeEvent) => Promise<void>,
  close: (request: CloseRequest) => void,
) {
  let queue: Promise<unknown> = Promise.resolve();
  /** Preserves request order across asynchronous development-server authentication. */
  function authorized<T>(event: IpcMainInvokeEvent, action: () => Promise<T> | T): Promise<T> {
    const operation = queue.then(async () => {
      await authorize(event);
      return action();
    });
    queue = operation.catch(() => {});
    return operation;
  }
  ipcMain.handle(SETTINGS_CHANNEL, (event, input: SettingsRequest) =>
    authorized(event, async () => {
      const result = request.safeParse(input);
      if (!result.success) throw new Error('配置操作无效。');
      const value = result.data;
      switch (value.action) {
      case 'read':
        return settings.snapshot();
      case 'update':
        return settings.update(value.key, value.value);
      case 'json':
        return settings.saveJson(value.text, value.revision);
      case 'secret':
        return settings.setSecret(value.key, value.value);
      case 'directory': {
        const current = value.current && isAbsolute(value.current) ? value.current : undefined;
        const selected = await dialog.showOpenDialog(window()!, {
          properties:  ['openDirectory', 'createDirectory'],
          defaultPath: current,
        });
        return selected.canceled ? null : (selected.filePaths[0] ?? null);
      }
      case 'openDirectory': {
        const error = await shell.openPath(dirname(file));
        if (error) throw new Error('无法打开配置目录。');
        return;
      }
      case 'paths': {
        const config = settings.snapshot().config;
        const group = pathGroups[value.game];
        /** Keeps explicit values usable even when a directory has not been created yet. */
        const resolve = (key: string, candidate: string | null) =>
          config.paths[key] ?? (candidate && existsSync(candidate) ? candidate : null);
        return Object.fromEntries(
          (['data', 'image'] as const).map(kind => {
            const rootKey = `${value.game}.${kind}`;
            const globalRoot = config.paths[kind === 'data' ? 'data' : 'asset'];
            const root = resolve(rootKey, globalRoot ? `${globalRoot}/${value.game}` : null);
            return [
              kind,
              {
                root,
                leaves: Object.entries(group[kind]).map(([name, label]) => ({
                  key:  `${rootKey}.${name}`,
                  label,
                  path: resolve(`${rootKey}.${name}`, root ? `${root}/${name}` : null),
                })),
              },
            ];
          }),
        );
      }
      }
    }),
  );
  ipcMain.handle(CLOSE_CHANNEL, (event, input: unknown) =>
    authorized(event, () => {
      const value = z
        .discriminatedUnion('action', [
          z.strictObject({ action: z.literal('dirty'), value: z.boolean() }),
          z.strictObject({ action: z.literal('resolve'), choice: z.enum(['save', 'discard', 'cancel']) }),
        ])
        .parse(input);
      close(value);
    }),
  );
}
