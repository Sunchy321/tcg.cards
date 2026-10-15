import type { AnnouncementItem } from '@tcg-cards/model/magic/schema/announcement';

/** Expands sentinel groups and rotation removals into card events for format history and banlists. */
export function expandFormatChanges<T extends AnnouncementItem & { date: string }>(changes: T[], formatId: string): T[] {
  // Raw ids may match the query even when replay excludes a format outside its lifetime.
  return changes.filter(change => change.projection.formats.includes(formatId)).flatMap(change => [
    // Sentinel ids describe a group, never a card to display or keep in a banlist.
    ...(change.type === 'card_change' && change.cardId?.startsWith('#')
      ? change.projection.cards.map(card => ({
        ...change,
        ...(change.cardId!.startsWith('#{clone:') && (card.sourceFormats != null || card.sourceFormat != null)
          ? { copiedFrom: card.sourceFormats ?? [card.sourceFormat!] }
          : {}),
        cardId:        card.cardId,
        format:        formatId,
        group:         change.cardId!.startsWith('#{clone:') ? null : change.cardId!.slice(1),
        status:        card.status as AnnouncementItem['status'],
        score:         card.score ?? change.score,
        effectiveDate: card.effectiveDate,
        date:          card.effectiveDate ?? change.date,
        relatedCards:  [],
      }))
      : [change]),
    ...(change.projection.derivedCards ?? [])
      .filter(card => card.formatId === formatId)
      .map(card => ({
        ...change,
        type:          'card_change' as const,
        format:        formatId,
        cardId:        card.cardId,
        setId:         null,
        status:        'unavailable' as const,
        score:         null,
        group:         card.group,
        relatedCards:  [],
        effectiveDate: card.effectiveDate,
        date:          card.effectiveDate ?? change.date,
      })),
  ]);
}
