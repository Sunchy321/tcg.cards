import { describe, expect, test } from 'bun:test';

import { computeGlowDiff } from '../../announcement/glow-calc';
import { runeInput } from './cards/rune.fixture';
import { runProjection } from './cards/runner';
import { reconcileLocalizations } from './reconcile';
import { buildLocalizationHashPayload, hashCanonicalJson } from './hash';

/** Projects real card-text examples through localization and render-model generation. */
function projectText(build: number, text: string) {
  const input = structuredClone(runeInput);
  input.build = build;
  input.card.textBuilderType = 0;
  input.card.textInHand!.m_locValues = input.card.textInHand!.m_locValues.map(() => text);

  return runProjection(input).localizations;
}

describe('versioned ampersand text', () => {
  test('the existing reconciler splits a shared row when reprojecting its legacy version', async () => {
    const raw = 'La S.P.R. & Co.';
    const shared = { ...projectText(254477, raw)[0]!, version: [253932, 254477] };
    const legacy = { ...projectText(253932, raw)[0]!, version: [253932] };
    const result = await reconcileLocalizations([shared], [legacy], 253932, 254477);

    expect(result.finalRows).toHaveLength(2);
    expect(result.finalRows.find(row => row.localizationHash === legacy.localizationHash)?.version).toEqual([253932]);
    expect(result.finalRows.find(row => row.localizationHash === shared.localizationHash)?.version).toEqual([254477]);
  });

  test('separates identical raw text using hash-only localization hints', async () => {
    const raw = 'La S.P.R. & Co.';
    const old = { ...projectText(253932, raw)[0]!, version: [253932] };
    const current = { ...projectText(254477, raw)[0]!, version: [254477] };

    expect(old).not.toHaveProperty('localizationHints');
    expect(current).not.toHaveProperty('localizationHints');
    expect(old.localizationHash).toBe(hashCanonicalJson(buildLocalizationHashPayload(old, ['legacy-text-ampersand'])));
    expect(current.localizationHash).toBe(hashCanonicalJson(buildLocalizationHashPayload(current)));
    expect(old.localizationHash).not.toBe(current.localizationHash);
    expect(old.displayText).toBe(raw);
    expect(current.displayText).toBe('La S.P.R.  Co.');
    const merged = await reconcileLocalizations([old], [current], 254477, 254477);
    expect(merged.finalRows).toHaveLength(2);
    expect(merged.finalRows.find(row => row.localizationHash === old.localizationHash)?.version).toEqual([253932]);
  });

  test('omits empty localization hints from the hash input', () => {
    const row = projectText(253932, 'No ampersand.')[0]!;
    const payload = buildLocalizationHashPayload(row);

    expect(payload).not.toHaveProperty('localizationHints');
    expect(row.localizationHash).toBe(hashCanonicalJson(payload));
    expect(row.localizationHash).toBe(projectText(254477, 'No ampersand.')[0]!.localizationHash);
    expect(projectText(253216, 'A & B')[0]!.localizationHash).toBe(projectText(253932, 'A & B')[0]!.localizationHash);
  });

  test.each([
    { build: 253932, raw: 'Give a minion <b>Divine Shield</b> & <b>Windfury</b>.', display: 'Give a minion <b>Divine Shield</b> & <b>Windfury</b>.', text: 'Give a minion Divine Shield & Windfury.' },
    { build: 254477, raw: 'Give a minion <b>Divine Shield</b> \\& <b>Windfury</b>.', display: 'Give a minion <b>Divine Shield</b> & <b>Windfury</b>.', text: 'Give a minion Divine Shield & Windfury.' },
    { build: 254477, raw: '在你施放一个法术后，&对所有随从造成1点伤害。', display: '在你施放一个法术后，对所有随从造成1点伤害。', text: '在你施放一个法术后，对所有随从造成1点伤害。' },
    { build: 256589, raw: 'After you cast a spell,& deal 1 damage to ALL minions.', display: 'After you cast a spell, deal 1 damage to ALL minions.', text: 'After you cast a spell, deal 1 damage to ALL minions.' },
    { build: 253932, raw: 'Keep \\& unchanged.', display: 'Keep \\& unchanged.', text: 'Keep \\& unchanged.' },
    { build: 254477, raw: 'One & two & three.', display: 'One & two & three.', text: 'One & two & three.' },
    { build: 254477, raw: 'One \\& two & three.', display: 'One & two & three.', text: 'One & two & three.' },
  ])('parses $raw at build $build', ({ build, raw, display, text }) => {
    for (const row of projectText(build, raw)) {
      expect(row.richText).toBe(raw);
      expect(row.displayText).toBe(display);
      expect(row.text).toBe(text);
      expect(row.renderModel?.localization?.richText).toBe(raw);
    }
  });

  test('adds the compatibility hint only to old localizations containing ampersands', () => {
    const input = structuredClone(runeInput);
    input.build = 253932;
    input.card.textInHand!.m_locValues[0] = 'Give a minion <b>Divine Shield</b> & <b>Windfury</b>.';
    const rows = runProjection(input).localizations;

    expect(rows.find(row => row.lang === 'en')?.renderModel?.renderHints).toEqual(['legacy-text-ampersand']);
    expect(rows.find(row => row.lang === 'zhs')?.renderModel?.renderHints).toBeUndefined();
    expect(projectText(254477, 'Gain \\& keep.')[0]?.renderModel?.renderHints).toBeUndefined();
  });

  test('keeps render hashes reusable across builds with the same text semantics', () => {
    expect(projectText(253932, 'No ampersand.')[0]?.renderHash).toBe(projectText(254477, 'No ampersand.')[0]?.renderHash);
    expect(projectText(253216, 'Gain A & B.')[0]?.renderHash).toBe(projectText(253932, 'Gain A & B.')[0]?.renderHash);
    expect(projectText(253932, 'Gain A & B.')[0]?.renderHash).not.toBe(projectText(254477, 'Gain A & B.')[0]?.renderHash);
  });

  test('does not mark text-format migration as a gameplay change', () => {
    const prev = projectText(253932, 'Give a minion <b>Divine Shield</b> & <b>Windfury</b>.')[0]!.renderModel!;
    const curr = projectText(254477, 'Give a minion <b>Divine Shield</b> \\& <b>Windfury</b>.')[0]!.renderModel!;

    expect(computeGlowDiff(curr, prev)).toEqual([]);
  });

  test('persists corrected derived text when raw and render hashes are unchanged', async () => {
    const raw = 'After you cast a spell,& deal 1 damage to ALL minions.';
    const target = { ...projectText(254477, raw)[0]!, version: [254477] };
    const existing = { ...target, displayText: raw, text: raw };
    const result = await reconcileLocalizations([existing], [target], 254477, 254477);

    expect(result.syncPlan.upsertRows).toHaveLength(1);
    expect(result.syncPlan.upsertRows[0]?.displayText).toBe('After you cast a spell, deal 1 damage to ALL minions.');
  });
});
