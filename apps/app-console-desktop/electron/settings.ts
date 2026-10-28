import { configuration, parseConfiguration, validationMessage, pathKeys } from '../shared/settings.ts';
import type { Configuration, MigrationItem, SettingsSnapshot } from '../shared/settings.ts';

/** Atomic document persistence owned exclusively by the main process. */
export interface Storage {
  read(): Record<string, unknown>;
  write(value: Record<string, unknown>): void;
}
/** OS encryption boundary, replaceable by a deterministic cipher in isolated tests. */
export interface Cipher {
  encrypt(value: string): Promise<string>;
  decrypt(value: string): Promise<string>;
}
/** Persisted envelope, distinct from the public JSON document. */
interface Document {
  config:    Configuration;
  secrets:   Record<string, string>;
  migration: MigrationItem[];
  inherited: boolean;
  revision:  number;
}

/** Owns validated settings, encrypted credentials and independent task snapshots. */
export class Settings {
  private storage:  Storage;
  private cipher:   Cipher;
  private document: Document;
  private queue:    Promise<unknown> = Promise.resolve();

  constructor(storage: Storage, cipher: Cipher) {
    this.storage = storage;
    this.cipher = cipher;
    const stored = storage.read();
    if (Object.keys(stored).length === 0) {
      this.document = {
        config:    configuration.parse({ version: 1 }),
        secrets:   {},
        migration: [],
        inherited: false,
        revision:  0,
      };
    } else {
      // Never clear or silently replace a corrupt configuration with defaults.
      const config = configuration.safeParse(stored.config);
      if (
        !config.success
        || typeof stored.secrets !== 'object'
        || !stored.secrets
        || Array.isArray(stored.secrets)
        || !Object.values(stored.secrets).every(value => typeof value === 'string')
        || !Array.isArray(stored.migration)
        || typeof stored.inherited !== 'boolean'
        || !Number.isSafeInteger(stored.revision)
      ) {
        throw new Error('无法读取已保存的设置，请检查配置文件。');
      }
      this.document = {
        config:    config.data,
        secrets:   stored.secrets as Record<string, string>,
        migration: stored.migration as MigrationItem[],
        inherited: stored.inherited,
        revision:  stored.revision as number,
      };
    }
  }

  /** Returns a detached configuration that a running task can retain unchanged. */
  snapshot(): SettingsSnapshot {
    return structuredClone({
      config:      this.document.config,
      revision:    this.document.revision,
      credentials: Object.fromEntries(Object.keys(this.document.secrets).map(key => [key, true])),
      migration:   this.document.migration,
    });
  }

  /** Serializes all writes, including asynchronous credential encryption. */
  private transact(change: (draft: Document) => Promise<void> | void): Promise<SettingsSnapshot> {
    const operation = this.queue.then(async () => {
      const draft = structuredClone(this.document);
      await change(draft);
      const result = configuration.safeParse(draft.config);
      if (!result.success) throw new Error(validationMessage(result.error));
      draft.config = result.data;
      // A changed binding cannot retain verification from its previous destination.
      for (const target of draft.config.publish) {
        const previous = this.document.config.publish.find(item => item.credentialKey === target.credentialKey);
        if (
          previous
          && (previous.publishTarget !== target.publishTarget || previous.environment !== target.environment)
        )
          Reflect.deleteProperty(target, 'targetFingerprint');
      }
      const oldYugioh = this.document.config.games.yugioh?.publish;
      const newYugioh = draft.config.games.yugioh?.publish;
      if (
        oldYugioh
        && newYugioh
        && (oldYugioh.publishTargetId !== newYugioh.publishTargetId || oldYugioh.environment !== newYugioh.environment)
      )
        newYugioh.targetFingerprint = '';
      draft.revision++;
      try {
        this.storage.write(draft as unknown as Record<string, unknown>);
      } catch {
        throw new Error('设置保存失败，请检查配置目录是否可写。');
      }
      this.document = draft;
      return this.snapshot();
    });
    this.queue = operation.catch(() => {});
    return operation;
  }

  /** Updates one declared ordinary field without overwriting concurrent form edits. */
  update(key: string, value: unknown) {
    return this.transact(draft => {
      if (key.startsWith('paths.')) {
        const path = key.slice(6);
        if (!pathKeys.includes(path)) throw new Error('不支持的目录设置。');
        if (value === null || value === '') Reflect.deleteProperty(draft.config.paths, path);
        else draft.config.paths[path] = value as string;
        return;
      }
      const allowed = [
        'ai.baseUrl',
        'ai.model',
        'games.hearthstone.image.rendererBaseUrl',
        'games.hearthstone.image.bucketDir',
        'games.yugioh.image.bucketDir',
        'games.yugioh.publish',
        'publish',
      ];
      if (!allowed.includes(key)) throw new Error('不支持的配置项目。');
      const parts = key.split('.');
      let target = draft.config as unknown as Record<string, unknown>;
      for (const part of parts.slice(0, -1)) {
        target[part] ??= {};
        target = target[part] as Record<string, unknown>;
      }
      const leaf = parts.at(-1)!;
      if (value === '' || value === null) Reflect.deleteProperty(target, leaf);
      else target[leaf] = value;
    });
  }

  /** Replaces only ordinary settings, rejecting stale editors rather than losing edits. */
  saveJson(text: string, revision: number) {
    return this.transact(draft => {
      if (draft.revision !== revision) throw new Error('设置已发生变化，请重新加载后再保存。');
      draft.config = parseConfiguration(text);
    });
  }

  /** Encrypts one complete secret before any persistent write occurs. */
  setSecret(key: string, value: string | null, options: { inherited?: boolean } = {}) {
    return this.transact(async draft => {
      if (!/^(database|ai|legacy-session|legacy-login|remote-session|yugioh-publish|publish:[\w-]+)$/.test(key))
        throw new Error('不支持的凭据项目。');
      if (!options.inherited) {
        const target = draft.config.publish.find(item => `publish:${item.credentialKey}` === key);
        if (target) delete target.targetFingerprint;
        if (key === 'yugioh-publish' && draft.config.games.yugioh?.publish)
          draft.config.games.yugioh.publish.targetFingerprint = '';
      }
      if (value === null || value === '') {
        Reflect.deleteProperty(draft.secrets, key);
        return;
      }
      if (key === 'database' || key === 'yugioh-publish' || key.startsWith('publish:')) {
        try {
          const url = new URL(value);
          if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname) throw new Error();
        } catch {
          throw new Error('请输入有效的 PostgreSQL 连接字符串。');
        }
      }
      try {
        draft.secrets[key] = await this.cipher.encrypt(value);
      } catch {
        throw new Error('无法加密保存凭据，请检查系统钥匙串权限。');
      }
    });
  }

  /** Resolves a secret only for trusted business execution, never for JSON export. */
  async secret(key: string): Promise<string | null> {
    await this.queue;
    const value = this.document.secrets[key];
    if (!value) return null;
    try {
      return await this.cipher.decrypt(value);
    } catch {
      throw new Error('无法读取凭据，请重新填写或检查系统钥匙串权限。');
    }
  }

  /** Records first-run migration once, including partial failures, without later overwrite. */
  finishInheritance(items: MigrationItem[]) {
    return this.transact(draft => {
      draft.inherited = true;
      draft.migration = items;
    });
  }

  /** Indicates whether this installation has already attempted legacy inheritance. */
  hasInherited() {
    return this.document.inherited;
  }
}
