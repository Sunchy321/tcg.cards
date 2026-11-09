import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { readPathOverride } from '../runtime-config';

/** One declared path leaf: its dotted leaf name and a UI label. */
export interface GamePathLeaf {
  name:  string;
  label: string;
}

/** One game's declared data/image path leaves. */
export interface GamePathLeaves {
  data:  GamePathLeaf[];
  image: GamePathLeaf[];
}

const declarations = new Map<string, GamePathLeaves>();

/** Registers one game's declared data/image path leaves. */
export function registerGamePaths(game: string, leaves: GamePathLeaves) {
  declarations.set(game, leaves);
}

function declaredLeaves(game: string, ns: 'data' | 'image'): GamePathLeaf[] {
  return declarations.get(game)?.[ns] ?? [];
}

/**
 * Resolves the effective path for a dotted `{game}.{ns}.{leaf}` key. An explicit
 * override wins; otherwise the parent (game root, then the global `data`/`asset`
 * root) is resolved and the leaf name appended when that folder exists. Derived
 * leaves are never stored, so they stay in sync with the filesystem.
 */
export function resolvePath(key: string): string | null {
  const explicit = readPathOverride(key);
  if (explicit != null) return explicit;

  const parts = key.split('.');
  if (parts.length === 1) return null;

  const parentKey = parts.length === 2
    ? (parts[1] === 'image' ? 'asset' : 'data')
    : parts.slice(0, -1).join('.');
  const parent = resolvePath(parentKey);
  if (parent == null) return null;

  // A game root (`{game}.{ns}`) appends the game name; a leaf appends its name.
  const segment = parts.length === 2 ? parts[0]! : parts[parts.length - 1]!;
  const candidate = join(parent, segment);
  return existsSync(candidate) ? candidate : null;
}

/** Whether the given key has an explicit override (vs being derived). */
export function isExplicitPath(key: string): boolean {
  return readPathOverride(key) != null;
}

/** One resolved leaf entry returned to the settings UI. */
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

/** Builds the full effective path state for one game from its declarations. */
export function getGamePathState(game: string): GamePathState {
  const leafState = (ns: 'data' | 'image') => declaredLeaves(game, ns).map(leaf => {
    const key = `${game}.${ns}.${leaf.name}`;
    return {
      name:     leaf.name,
      label:    leaf.label,
      path:     resolvePath(key),
      explicit: isExplicitPath(key),
    } satisfies GamePathLeafState;
  });

  const nsState = (ns: 'data' | 'image') => {
    const rootKey = `${game}.${ns}`;
    return {
      root:         resolvePath(rootKey),
      rootExplicit: isExplicitPath(rootKey),
      leaves:       leafState(ns),
    };
  };

  return {
    game,
    data:  nsState('data'),
    image: nsState('image'),
  };
}
