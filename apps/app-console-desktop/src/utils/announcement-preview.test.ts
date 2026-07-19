import { describe, expect, test } from 'bun:test';

import { mergePreviews, selectPreview, type SidePreview } from './announcement-preview';

/** Builds one concise preview fixture for state-selection tests. */
function preview(side: string, lang: string, hash: string): SidePreview {
  return { side, lang, hash, category: 'base', template: 'normal', base64: hash };
}

describe('mergePreviews', () => {
  test('replaces matching results and preserves unaffected previews', () => {
    const current = [preview('prev', 'zhs', 'old-prev'), preview('curr', 'zhs', 'old-curr')];
    const replacements = [preview('curr', 'zhs', 'new-curr')];

    expect(mergePreviews(current, replacements)).toEqual([
      preview('prev', 'zhs', 'old-prev'),
      preview('curr', 'zhs', 'new-curr'),
    ]);
  });

  test('keeps separate languages for the same side', () => {
    const result = mergePreviews(
      [preview('base', 'en', 'english')],
      [preview('base', 'zhs', 'chinese')],
    );

    expect(result).toEqual([preview('base', 'en', 'english'), preview('base', 'zhs', 'chinese')]);
  });
});

describe('selectPreview', () => {
  test('prefers zhs in all-language mode', () => {
    const previews = [preview('curr', 'en', 'english'), preview('curr', 'zhs', 'chinese')];

    expect(selectPreview(previews, 'curr', 'all')?.hash).toBe('chinese');
  });

  test('falls back to en in all-language mode', () => {
    expect(selectPreview([preview('curr', 'en', 'english')], 'curr', 'all')?.hash).toBe('english');
  });

  test('does not substitute another language in single-language mode', () => {
    expect(selectPreview([preview('curr', 'en', 'english')], 'curr', 'zhs')).toBeUndefined();
  });
});
