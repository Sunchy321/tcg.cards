/** Shares announcement publisher names and imported title formatting across site pages. */
export function useAnnouncementLabels() {
  const { t, te } = useI18n();

  /** Resolves stored source identifiers to reader-facing publisher names. */
  function sourceLabel(source: string): string {
    const key = `magic.announcement.sources.${source}`;
    return te(key) || te(key, 'en') ? t(key) : t('magic.announcement.sourceOther');
  }

  /** Preserves article titles and gives imported placeholders a readable publisher title. */
  function announcementTitle(row: { name: string, source: string, date: string }): string {
    if (row.name.trim() && row.name !== `${row.source} - ${row.date}`) return row.name;
    const label = sourceLabel(row.source);
    return ['initial', 'release', 'rotation'].includes(row.source)
      ? label
      : t('magic.announcement.sourceAnnouncement', { source: label });
  }

  return { sourceLabel, announcementTitle };
}
