/** Describes one game-independent release in the public catalog. */
export interface SeriesEntry {
  id:             string;
  name:           string;
  secondaryName?: string;
  searchNames?:   string[];
  type:           string;
  releaseDate:    string | null;
  parentId?:      string | null;
  isMajor?:       boolean;
  icon?:          string;
  fallbackIcon?:  string;
  to:             string;
}

/** Restricts a flat catalog without requiring parent records in the result. */
export interface SeriesFilters {
  query:     string;
  type:      string | null;
  year:      string | null;
  majorOnly: boolean;
  parentId:  string | null;
  sort:      'newest' | 'oldest' | 'name';
}

/** Filters the whole catalog, counts matching categories, and clamps pagination. */
export function querySeries(entries: SeriesEntry[], filters: SeriesFilters, page = 1, pageSize = 25, locale = 'en') {
  const query = filters.query.trim().toLocaleLowerCase(locale);
  const base = entries.filter(entry => {
    const year = entry.releaseDate?.slice(0, 4) ?? 'undated';
    const names = [entry.id, entry.name, entry.secondaryName ?? '', ...entry.searchNames ?? []];

    return (filters.year == null || year === filters.year)
      && (!filters.majorOnly || entry.isMajor === true)
      && (filters.parentId == null || entry.parentId === filters.parentId)
      && (!query || names.some(name => name.toLocaleLowerCase(locale).includes(query)));
  });

  const typeCounts: Record<string, number> = {};
  for (const entry of base) typeCounts[entry.type] = (typeCounts[entry.type] ?? 0) + 1;

  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: 'base' });
  const matches = base.filter(entry => filters.type == null || entry.type === filters.type);
  matches.sort((a, b) => {
    if (filters.sort !== 'name') {
      // Unknown dates stay last in either direction, rather than looking like future releases.
      if (a.releaseDate == null && b.releaseDate != null) return 1;
      if (a.releaseDate != null && b.releaseDate == null) return -1;
      const date = (a.releaseDate ?? '').localeCompare(b.releaseDate ?? '');
      if (date !== 0) return filters.sort === 'oldest' ? date : -date;
    }

    return collator.compare(a.name, b.name) || collator.compare(a.id, b.id);
  });

  const size = Math.max(1, Math.floor(pageSize));
  const current = Math.max(1, Math.min(Math.floor(page), Math.ceil(matches.length / size)));

  return {
    rows:          matches.slice((current - 1) * size, current * size),
    total:         matches.length,
    page:          current,
    typeCounts,
    categoryTotal: base.length,
  };
}
