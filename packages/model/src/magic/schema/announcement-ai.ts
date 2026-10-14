import { z } from 'zod';

import { changeStatus, changeStatusByType, gameChangeType } from './announcement';

const optionalText = z.string().trim().min(1).nullish().transform(value => value ?? null);
const optionalDate = z.iso.date().nullish().transform(value => value ?? null);

/** Announcement information extracted only when explicitly present in the source. */
export const aiAnnouncementHeader = z.object({
  name:                  optionalText,
  date:                  optionalDate,
  effectiveDate:         optionalDate,
  effectiveDateTabletop: optionalDate,
  effectiveDateOnline:   optionalDate,
  effectiveDateArena:    optionalDate,
  nextDate:              optionalDate,
});

/** Validated changes ready for the announcement editor, without model-generated identifiers. */
export const aiAnnouncementItem = z.object({
  type:          gameChangeType,
  status:        changeStatus.nullish().transform(value => value ?? null),
  effectiveDate: optionalDate,
  format:        optionalText,
  cardId:        optionalText,
  setId:         optionalText,
  ruleId:        optionalText,
  relatedCards:  z.array(z.string().min(1)).default([]),
  score:         z.int().min(1).nullish().transform(value => value ?? null),
}).superRefine((item, ctx) => {
  const statuses: readonly string[] = changeStatusByType[item.type].statuses;
  if (item.status != null && !statuses.includes(item.status)) {
    ctx.addIssue({ code: 'custom', message: 'Status does not match the change type', path: ['status'] });
  }
  if (statuses.length > 0 && item.status == null) {
    ctx.addIssue({ code: 'custom', message: 'Change status is required', path: ['status'] });
  }
  if (item.status === 'score' && item.score == null) {
    ctx.addIssue({ code: 'custom', message: 'Point value is required', path: ['score'] });
  }
});

/** The validated result delivered by the Magic announcement stream. */
export const aiAnnouncementResult = z.object({
  header: aiAnnouncementHeader,
  items:  z.array(aiAnnouncementItem),
});

/** Validated announcement information and change entries returned to the editor. */
export type AiAnnouncementResult = z.infer<typeof aiAnnouncementResult>;
