/** Serializable action definition, usable on both SSR and client. */
export interface ActionDef {
  id:    string;
  icon?: string;
}

/** Full action with an optional handler (handler is only meaningful on the client). */
export interface Action extends ActionDef {
  handler?: () => void | Promise<void>;
}

// ─── Client-only module-level singletons ─────────────────────────────────────
// Vite tree-shakes the import.meta.client branches in the server bundle,
// so these are never read or written on the server.

/** Registered client-side handlers: action id → handler function. */
const _handlers = shallowReactive(new Map<string, () => void | Promise<void>>());

/**
 * UID of the last component that called setActions.
 * Used to prevent an outgoing page's onUnmounted from clearing the incoming
 * page's handlers (last-writer-wins, same as before).
 */
let _ownerUid = -1;

// ─────────────────────────────────────────────────────────────────────────────

/** A resolved action entry as returned by getActions(). */
export type ResolvedAction = ActionDef & {
  handler:  () => void | Promise<void>;
  disabled: boolean;
};

export const useActions = () => {
  // Action *definitions* (id + icon) live in route.meta.actions declared via
  // definePageMeta. They are available before any component renders on both
  // SSR and client, so the Header can read them without a hydration mismatch.
  const route = useRoute();

  const instance = getCurrentInstance();
  const instanceUid = instance?.uid ?? -1;

  /**
   * Register client-side handlers for the current page's actions.
   * Definitions must be declared in definePageMeta({ actions: [...] }).
   * This function is a no-op on SSR.
   */
  const setActions = (actions: Action[]) => {
    if (import.meta.client) {
      _ownerUid = instanceUid;
      _handlers.clear();
      for (const action of actions) {
        if (action.handler) {
          _handlers.set(action.id, action.handler);
        }
      }
    }
  };

  /**
   * Clear handlers registered by this component.
   * Skipped if another component has already taken ownership via setActions,
   * preventing navigation flicker.
   */
  const clearActions = () => {
    if (import.meta.client) {
      if (_ownerUid !== instanceUid) return;
      _ownerUid = -1;
      _handlers.clear();
    }
  };

  /**
   * Returns a computed list of actions sourced from route.meta.actions with
   * handlers attached from the client registry (empty function on SSR).
   * Because route.meta is set before rendering, SSR and client produce
   * identical output — no hydration mismatch.
   */
  const getActions = () => computed<ResolvedAction[]>(() =>
    (route.meta.actions ?? []).map(def => {
      const handlerFn = import.meta.client ? _handlers.get(def.id) : undefined;
      const disabled = import.meta.client && handlerFn == null;

      return {
        ...def,
        disabled,
        handler: handlerFn ?? (() => {
          console.warn(`[actions] No handler registered for action "${def.id}"`);
        }),
      };
    }),
  );

  onUnmounted(() => {
    clearActions();
  });

  return {
    setActions,
    clearActions,
    getActions,
  };
};
