import { dialog, ipcMain } from 'electron';
import { z } from 'zod';

import { FILE_DIALOG_CHANNEL } from './contract';
import type { BrowserWindow, IpcMainInvokeEvent, OpenDialogOptions } from 'electron';

const request = z.strictObject({ action: z.literal('zipArchive') });

/** Registers native file selection behind the authorized renderer boundary. */
export function registerFileDialogs(
  window: () => BrowserWindow | null,
  authorize: (event: IpcMainInvokeEvent) => Promise<void>,
): void {
  ipcMain.handle(FILE_DIALOG_CHANNEL, async (event, input: unknown) => {
    await authorize(event);
    const parsed = request.safeParse(input);
    if (!parsed.success) throw new Error('文件选择请求无效。');

    const options: OpenDialogOptions = {
      properties: ['openFile'],
      filters:    [{ name: 'ZIP', extensions: ['zip'] }],
    };
    const parent = window();
    const result = parent == null
      ? await dialog.showOpenDialog(options)
      : await dialog.showOpenDialog(parent, options);
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });
}
