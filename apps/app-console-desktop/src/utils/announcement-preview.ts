/** Holds one locally loaded preview for a specific item side and language. */
export interface SidePreview {
  side: string;
  lang: string;
  hash: string;
  category: string;
  template: string;
  base64: string;
  mimeType?: string;
}

/** Merges successfully loaded previews without discarding unaffected sides or languages. */
export function mergePreviews(current: SidePreview[], replacements: SidePreview[]) {
  const merged = new Map(current.map(preview => [`${preview.side}\0${preview.lang}`, preview]));

  for (const preview of replacements) {
    merged.set(`${preview.side}\0${preview.lang}`, preview);
  }

  return [...merged.values()];
}

/** Selects the requested language, preferring Chinese then English in all-language mode. */
export function selectPreview(previews: SidePreview[], side: string, lang: string) {
  const sidePreviews = previews.filter(preview => preview.side === side);

  if (lang !== 'all') {
    return sidePreviews.find(preview => preview.lang === lang);
  }

  return sidePreviews.find(preview => preview.lang === 'zhs')
    ?? sidePreviews.find(preview => preview.lang === 'en');
}
