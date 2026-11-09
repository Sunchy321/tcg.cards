/** Resolves a series symbol directly from its database setId. */
export function hearthstoneSetIconUrl(assetBaseUrl: string, setId: string) {
  return `${assetBaseUrl.replace(/\/+$/, '')}/hearthstone/set/icon/${encodeURIComponent(setId)}/default.svg`;
}
