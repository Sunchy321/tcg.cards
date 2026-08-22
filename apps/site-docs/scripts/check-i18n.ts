#!/usr/bin/env bun
/// <reference types="node" />

/**
 * Validates that every field / enum value rendered by the docs has a localized
 * description in both `en` and `zhs`, and that no stale messages remain.
 *
 * It derives the expected key set from the shared API registry (endpoint
 * descriptions, resource labels, field paths, and named enums) and diffs it
 * against the flattened message files. Any missing or orphaned key fails the
 * check — there is no exemption.
 *
 * Usage: bun scripts/check-i18n.ts
 */

import { collectAllKeys } from '../lib/model-keys';
import { collectEndpoints, collectEnums, listGames } from '../lib/registry-docs';

import enMessages from '../i18n/locales/en/index';
import zhsMessages from '../i18n/locales/zhs/index';

type Messages = Record<string, unknown>;

const GAME_KEYS = listGames().map(game => game.id);

/** Flattens a nested message object into dotted keys (leaf values kept). */
function flatten(obj: Messages, prefix = ''): Set<string> {
  const keys = new Set<string>();
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      for (const leaf of flatten(value as Messages, path)) {
        keys.add(leaf);
      }
    } else {
      keys.add(path);
    }
  }
  return keys;
}

/** Collects the expected keys for one game (endpoints, resources, fields, enums). */
function expectedKeys(game: string): string[] {
  const endpoints = collectEndpoints().filter(ep => ep.game === game);
  const keys = collectAllKeys(endpoints);

  for (const enumDoc of collectEnums(game)) {
    keys.push(`${game}.enums.${enumDoc.slug}._self`);
    for (const value of enumDoc.values) {
      keys.push(`${game}.enums.${enumDoc.slug}.${value}`);
    }
  }

  return [...new Set(keys)].sort();
}

/** UI-level messages under a game namespace that are not driven by the registry. */
const UI_ONLY_PREFIXES = ['name', 'description', 'enums._self', 'enums.values'];

function isUiOnly(key: string, game: string): boolean {
  const rest = key.slice(game.length + 1);
  return UI_ONLY_PREFIXES.includes(rest);
}

function checkLocale(locale: string, messages: Messages): boolean {
  const present = flatten(messages);
  let ok = true;

  for (const game of GAME_KEYS) {
    const expected = expectedKeys(game);

    const missing = expected.filter(key => !present.has(key));
    if (missing.length > 0) {
      ok = false;
      console.error(`[${locale}] ${game}: ${missing.length} missing key(s)`);
      for (const key of missing) {
        console.error(`  missing  ${key}`);
      }
    }

    const expectedSet = new Set(expected);
    const orphaned = [...present]
      .filter(key => key.startsWith(`${game}.`) && !expectedSet.has(key) && !isUiOnly(key, game));
    if (orphaned.length > 0) {
      ok = false;
      console.error(`[${locale}] ${game}: ${orphaned.length} orphaned key(s)`);
      for (const key of orphaned) {
        console.error(`  orphaned  ${key}`);
      }
    }
  }

  return ok;
}

let ok = true;
ok = checkLocale('en', enMessages as Messages) && ok;
ok = checkLocale('zhs', zhsMessages as Messages) && ok;

if (!ok) {
  console.error('i18n structure check failed');
  process.exit(1);
}

console.log('i18n structure check passed');
