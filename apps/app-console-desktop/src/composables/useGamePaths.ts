import { orpc } from '~/lib/orpc';

import { getDesktopPath, setDesktopPath } from './useDesktopSettings';

/** One resolved path leaf returned by the desktop runtime. */
export interface GamePathLeafState {
  name:     string;
  label:    string;
  path:     string | null;
  explicit: boolean;
}

/** Effective path state for one game's data/image roots and leaves. */
export interface GamePathState {
  game:  string;
  data:  { root: string | null, rootExplicit: boolean, leaves: GamePathLeafState[] };
  image: { root: string | null, rootExplicit: boolean, leaves: GamePathLeafState[] };
}

/** Reads one dotted `{game}.{ns}.{leaf}` path value from the desktop runtime. */
export function getPath(key: string) {
  return getDesktopPath(key);
}

/** Persists one dotted `{game}.{ns}.{leaf}` path value in the desktop runtime. */
export function setPath(key: string, value: string | null) {
  return setDesktopPath(key, value);
}

/** Reads the effective path state for one game's declared data/image leaves. */
export function getGamePathState(game: string) {
  return orpc.runtime.getGamePathState({ game }) as Promise<GamePathState>;
}
