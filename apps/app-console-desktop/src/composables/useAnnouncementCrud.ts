import { useToast } from '@nuxt/ui/composables';

import { useDesktopRuntimeClient } from '~/composables/useDesktopRuntimeClient';

/**
 * Announcement CRUD pipeline of one game's desktop runtime router. Reads toast
 * their failures and degrade to empty/null; writes rethrow so each page keeps
 * its own save-flow handling.
 */
export function useAnnouncementCrud(game: string) {
  const client = useDesktopRuntimeClient() as any;
  const toast = useToast();

  function notifyError(title: string, error: unknown) {
    toast.add({ title, description: error instanceof Error ? error.message : String(error), color: 'error' });
  }

  return {
    async list(): Promise<any[]> {
      try {
        return await client[game].announcement.list();
      } catch (error) {
        notifyError('加载失败', error);
        return [];
      }
    },

    async get(id: string): Promise<any | null> {
      try {
        return await client[game].announcement.get({ id });
      } catch (error) {
        notifyError('加载详情失败', error);
        return null;
      }
    },

    async create(payload: Record<string, unknown>): Promise<any> {
      return client[game].announcement.create(payload);
    },

    async update(id: string, payload: Record<string, unknown>): Promise<void> {
      return client[game].announcement.update({ id, ...payload });
    },

    async remove(id: string): Promise<void> {
      return client[game].announcement.remove({ id });
    },

    async project(announcementId: string): Promise<void> {
      return client[game].announcement.project({ announcementId });
    },

    async apply(dryRun: boolean): Promise<any> {
      return client[game].announcement.apply({ dryRun });
    },
  };
}
