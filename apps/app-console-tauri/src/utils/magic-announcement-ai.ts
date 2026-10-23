import type { AiAnnouncementResult } from '@tcg-cards/model/magic/schema/announcement-ai';

import { newFormItem, type AnnouncementFormConfig, type AnnouncementFormData } from './announcement-form-yaml';

/** Appends validated changes and fills only missing announcement information. */
export function applyMagicAiResult(form: AnnouncementFormData, result: AiAnnouncementResult, config: AnnouncementFormConfig): void {
  for (const field of ['name', 'date', 'effectiveDate', 'effectiveDateTabletop', 'effectiveDateOnline', 'effectiveDateArena', 'nextDate'] as const) {
    if (!form[field] && result.header[field]) form[field] = result.header[field];
  }
  const items = result.items.map(item => ({
    ...newFormItem(item.type, config),
    status:        item.status ?? '',
    effectiveDate: item.effectiveDate ?? '',
    format:        item.format ?? '',
    cardId:        item.cardId ?? '',
    setId:         item.setId ?? '',
    ruleId:        item.ruleId ?? '',
    relatedCards:  item.relatedCards.join(', '),
    score:         item.score,
  }));
  form.items.push(...items);
}
