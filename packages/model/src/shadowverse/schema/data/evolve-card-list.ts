import { z } from 'zod';

/** SVE Helper API envelope wrapping every response. */
export const sveHelperEnvelope = z.looseObject({
  code: z.number(),
  msg: z.string(),
});

/** One card row from the SVE Helper card list; zh fields may be empty when translation lags. */
export const sveCardListItem = z.looseObject({
  id: z.number(),
  card_no: z.string(),
  name_jp: z.string(),
  name_cn: z.string().nullable(),
  craft: z.string().nullable(),
  card_type: z.string().nullable(),
  type: z.string().nullable(),
  rare: z.string().nullable(),
  from: z.string().nullable(),
  cost: z.number().nullable(),
  attack: z.number().nullable(),
  life: z.number().nullable(),
  desc_jp: z.string().nullable(),
  desc_cn: z.string().nullable(),
  drawer: z.string().nullable(),
  img_url: z.string().nullable(),
  related_card_nos: z.string().nullable(),
  created_at: z.number(),
  speech: z.string().nullable(),
  title: z.string().nullable(),
  has_back: z.number(),
});

export type SveCardListItem = z.infer<typeof sveCardListItem>;

/** Paged card list payload. */
export const sveCardListData = z.looseObject({
  list: z.array(sveCardListItem),
  total: z.number(),
});

/** Full `/api/card/getCardList` response. */
export const sveCardListResponse = sveHelperEnvelope.extend({
  data: sveCardListData,
});

export type SveCardListResponse = z.infer<typeof sveCardListResponse>;
