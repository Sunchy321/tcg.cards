import { computed, onMounted, ref } from 'vue';

import { useDesktopSettings } from '~/composables/useDesktopSettings';

/** Games whose remembered publish target is stored in settings. */
export type PublishSelectionGame = 'magic' | 'hearthstone' | 'yugioh';

/** One publish destination presented to a publish page. */
export interface PublishTargetOption {
  id:          string;
  name:        string;
  kind:        'direct' | 'account';
  fingerprint: string | null;
  configured:  boolean;
}

/**
 * Exposes the user's publish destinations and the target remembered for one game.
 * Pages only select a destination; resolving its connection stays in the main process.
 */
export function usePublishTargetSelection(game: PublishSelectionGame, kind?: PublishTargetOption['kind']) {
  const { snapshot, load, update } = useDesktopSettings();
  const error = ref('');

  const targets = computed<PublishTargetOption[]>(() => {
    const signedIn = snapshot.value?.credentials['remote-session'] === true;
    return (snapshot.value?.config.targets ?? []).filter(target => kind === undefined || target.kind === kind).map(target => ({
      id:          target.id,
      name:        target.name,
      kind:        target.kind,
      fingerprint: target.targetFingerprint ?? null,
      configured:  target.kind === 'direct' ? Boolean(target.connectionString) : signedIn,
    }));
  });

  const remembered = computed(() => snapshot.value?.config.targetSelection?.[game] ?? '');
  const selected = computed<PublishTargetOption | null>(
    () => targets.value.find(target => target.id === remembered.value) ?? targets.value.find(target => target.configured) ?? (kind ? targets.value[0] : null) ?? null,
  );

  /** Selects one destination and remembers it for this game. */
  async function select(id: string) {
    error.value = '';
    if (snapshot.value?.config.targetSelection[game] === id) return;
    try {
      await update('targetSelection', { ...snapshot.value?.config.targetSelection, [game]: id });
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '无法保存发布目标选择。';
    }
  }

  /** Reloads destinations from the main process. */
  async function reload() {
    error.value = '';
    await load();
  }

  onMounted(reload);

  return { targets, selected, select, reload, error };
}
