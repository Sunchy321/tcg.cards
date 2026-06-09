interface ValueRef<T> {
  readonly value: T;
}

// ── Static definitions (put in definePageMeta / routeMeta) ────────────────────

/** Serializable param definition stored in route.meta.params. */
export interface ParamDef {
  id:    string;
  type:  'select' | 'switch';
  icon?: string;
}

// ── Dynamic configurations (registered at runtime via setParams) ──────────────

export interface SelectItem {
  value: string;
  label: string;
}

export interface SelectParamConfig {
  id:       string;
  type:     'select';
  /** Reactive ref of available choices — set by the page (ref 1). */
  items:    ValueRef<SelectItem[]>;
  /** Reactive ref of the current value — set by the page (ref 2). */
  value:    ValueRef<string | null>;
  onChange: (val: string) => void;
}

export interface SwitchParamConfig {
  id:       string;
  type:     'switch';
  /** Reactive ref of the current boolean value — set by the page (ref 2). */
  value:    ValueRef<boolean>;
  onChange: (val: boolean) => void;
}

export type ParamConfig = SelectParamConfig | SwitchParamConfig;

// ── Resolved param (static def merged with dynamic config) ───────────────────

export type ResolvedSelectParam = ParamDef & SelectParamConfig;
export type ResolvedSwitchParam = ParamDef & SwitchParamConfig;
export type ResolvedParam = ResolvedSelectParam | ResolvedSwitchParam;

// ── Module-level singletons (client-only) ────────────────────────────────────

/** UID of the last component that called setParams (last-writer-wins). */
let _ownerUid = -1;

/** Registered dynamic param configs keyed by param id. */
const _configs = shallowReactive(new Map<string, ParamConfig>());

// ── Composable ────────────────────────────────────────────────────────────────

export const useParams = () => {
  const route = useRoute();
  const instance = getCurrentInstance();
  const instanceUid = instance?.uid ?? -1;

  /**
   * Register runtime param state for the params declared in route.meta.params.
   *
   * Pass reactive refs (computed / ref) for `items` and `value` so the
   * composable stays in sync automatically — no manual watch needed.
   *
   * - `items` (SelectParamConfig): **ref 1** — enumerates the available choices
   * - `value`                    : **ref 2** — tracks the currently active value
   */
  const setParams = (configs: ParamConfig[]) => {
    if (import.meta.client) {
      _ownerUid = instanceUid;
      _configs.clear();
      for (const cfg of configs) {
        _configs.set(cfg.id, cfg);
      }
    }
  };

  /** Clear configs when the owning component unmounts (last-writer-wins guard). */
  const clearParams = () => {
    if (import.meta.client) {
      if (_ownerUid !== instanceUid) return;
      _ownerUid = -1;
      _configs.clear();
    }
  };

  /**
   * Returns a computed list of fully-resolved params — static defs from
   * route.meta.params merged with the dynamic configs from setParams.
   * Safe to call in AppHeader (returns [] on SSR).
   */
  const getParams = () => computed<ResolvedParam[]>(() => {
    if (!import.meta.client) return [];
    const defs: ParamDef[] = (route.meta as any).params ?? [];
    return defs.flatMap(def => {
      const cfg = _configs.get(def.id);
      if (!cfg) return [];
      return [{ ...def, ...cfg } as ResolvedParam];
    });
  });

  /**
   * **ref 1** — reactive map of available items for every select-type param.
   * Keys are param ids; values are the current `SelectItem[]`.
   * Useful for AppHeader to populate dropdowns.
   */
  const paramItems = computed<Record<string, SelectItem[]>>(() => {
    const result: Record<string, SelectItem[]> = {};
    for (const [id, cfg] of _configs) {
      if (cfg.type === 'select') {
        result[id] = cfg.items.value;
      }
    }
    return result;
  });

  /**
   * **ref 2** — reactive map of current values for all params.
   * Keys are param ids; values are the active `string | boolean | null`.
   * Useful for AppHeader to reflect the active selection / toggle state.
   */
  const paramValues = computed<Record<string, string | boolean | null>>(() => {
    const result: Record<string, string | boolean | null> = {};
    for (const [id, cfg] of _configs) {
      result[id] = cfg.value.value;
    }
    return result;
  });

  onUnmounted(() => {
    clearParams();
  });

  return {
    setParams,
    clearParams,
    getParams,
    /** Enumerable items per param id (ref 1) */
    paramItems,
    /** Current value per param id (ref 2) */
    paramValues,
  };
};
