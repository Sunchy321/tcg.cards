const placeholderSetIdPrefix = '__hsdata_missing_set_dbf_';

/** Placeholder setId reserved for unresolved hsdata set references. */
export function buildHsdataPlaceholderSetId(dbfId: number): string {
  return `${placeholderSetIdPrefix}${dbfId}`;
}

/** Placeholder set rows that still require manual set modeling. */
export function isHsdataPlaceholderSetId(setId: string): boolean {
  return setId.startsWith(placeholderSetIdPrefix);
}
