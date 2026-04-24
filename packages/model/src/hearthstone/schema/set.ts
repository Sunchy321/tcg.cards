import { z } from 'zod';

const nullableInt = z.int().nullable();
const nullableText = z.string().nullable();

export const setLocalization = z.strictObject({
  lang: z.string(),
  name: z.string(),
});

export const set = z.strictObject({
  setId: z.string(),

  dbfId: nullableInt,
  slug: nullableText,
  rawName: nullableText,

  localization: setLocalization.array(),

  type:          z.string(),
  releaseDate:   z.string(),
  cardCountFull: nullableInt,
  cardCount:     nullableInt,
  group:         nullableText,
});

export const setProfile = set;

export const setListInput = z.strictObject({
  q:     z.string().trim().max(200).optional(),
  type:  z.string().trim().max(100).optional(),
  group: z.string().trim().max(100).optional(),
  page:  z.int().positive().default(1),
  limit: z.int().positive().max(200).default(50),
});

export const setListResult = z.strictObject({
  items: z.array(setProfile),
  total: z.int().nonnegative(),
  page:  z.int().positive(),
  limit: z.int().positive(),
});

export const setGetInput = z.strictObject({
  setId: z.string().trim().min(1).max(160),
});

export const setUpdateInput = setGetInput.extend({
  dbfId:         nullableInt,
  slug:          nullableText,
  rawName:       nullableText,
  localization:  setLocalization.array(),
  type:          z.string().trim().min(1).max(100),
  releaseDate:   z.string().max(100),
  cardCountFull: nullableInt,
  cardCount:     nullableInt,
  group:         nullableText,
});

export type Set = z.infer<typeof set>;
export type SetLocalization = z.infer<typeof setLocalization>;
export type SetProfile = z.infer<typeof setProfile>;
export type SetListInput = z.infer<typeof setListInput>;
export type SetListResult = z.infer<typeof setListResult>;
export type SetGetInput = z.infer<typeof setGetInput>;
export type SetUpdateInput = z.infer<typeof setUpdateInput>;
