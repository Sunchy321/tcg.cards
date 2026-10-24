import { safeStorage } from 'electron';
import type { Cipher } from './settings';

/** Uses the OS key provider without ever falling back to a plaintext storage key. */
export const credentials: Cipher = {
  async encrypt(value) {
    if (!await safeStorage.isAsyncEncryptionAvailable()) throw new Error('加密服务不可用。');
    return (await safeStorage.encryptStringAsync(value)).toString('base64');
  },
  async decrypt(value) {
    if (!await safeStorage.isAsyncEncryptionAvailable()) throw new Error('加密服务不可用。');
    return (await safeStorage.decryptStringAsync(Buffer.from(value, 'base64'))).result;
  },
};
