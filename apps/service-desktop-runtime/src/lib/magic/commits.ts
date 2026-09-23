import type { PrintCommitFace, PrintCommitMetadata } from '@tcg-cards/db/schema/local/magic';

/**
 * Print-commit console logic that is pure by construction: validation and
 * normalization of a save payload. The oRPC handler supplies the database
 * facts and performs the row IO; everything that can be decided without a
 * database lives here so tests stay offline.
 */

/** The save payload as the console form submits it. */
export interface CommitSaveInput {
  oracleId: string;
  set:      string;
  number:   string;
  lang:     string;
  faces:    Array<Partial<PrintCommitFace>>;
  metadata: Partial<PrintCommitMetadata> | null;
  note:     string | null;
}

/** Database facts the validation needs; the handler queries them. */
export interface CommitSaveFacts {
  /** The oracle has an English scryfall row (the card exists). */
  cardExists:     boolean;
  /** An English scryfall row exists at the same (set, number) position. */
  positionExists: boolean;
}

/**
 * Returns a product-language error message, or null when the save may
 * proceed. Position validation mirrors the projection's strict same-position
 * cloning: a commit with no English print at its own position would silently
 * never project, so the console refuses it up front.
 */
export function validateCommitSave(input: CommitSaveInput, facts: CommitSaveFacts): string | null {
  if (input.oracleId.trim() === '') return '请先检索并选择一张卡牌。';
  if (!facts.cardExists) return '未找到该卡牌的数据，请重新检索选择。';
  if (input.set.trim() === '' || input.number.trim() === '') return '请填写系列代码与收藏编号。';
  if (input.lang.trim() === '') return '请选择语言。';
  if (!facts.positionExists) return '该系列下没有此编号的英文印刷。补全只能补已存在的印刷位置，请核对系列与编号。';
  return null;
}

const FACE_FIELDS = [
  'printedName',
  'printedTypeLine',
  'printedText',
  'flavorName',
  'flavorText',
  'artist',
  'watermark',
] as const;

/**
 * Trims the asserted strings and keeps face slots positional — an empty face
 * stays an empty slot so the remaining entries keep mapping to their oracle
 * faces. Trailing empty slots are trimmed off; interior ones are not.
 */
export function normalizeCommitFaces(faces: Array<Partial<PrintCommitFace>>): PrintCommitFace[] {
  const cleaned = faces.map(face => {
    const slot: PrintCommitFace = {};
    for (const key of FACE_FIELDS) {
      const value = face[key];
      const text = typeof value === 'string' ? value.trim() : value == null ? null : value;
      if (text != null && text !== '') slot[key] = text;
    }
    return slot;
  });
  while (cleaned.length > 0 && Object.keys(cleaned[cleaned.length - 1]!).length === 0) cleaned.pop();
  return cleaned;
}

const METADATA_STRINGS = ['rarity', 'releaseDate', 'frame', 'borderColor', 'securityStamp'] as const;
const METADATA_STRINGS_ARRAYS = ['finishes', 'promoTypes', 'artistIds'] as const;
const METADATA_BOOLEANS = ['isDigital', 'isPromo', 'inBooster'] as const;

/** Keeps only whitelisted, non-empty metadata overrides; null when nothing is asserted. */
export function normalizeCommitMetadata(metadata: Partial<PrintCommitMetadata> | null): PrintCommitMetadata | null {
  if (metadata == null) return null;
  const out: PrintCommitMetadata = {};
  for (const key of METADATA_STRINGS) {
    const value = metadata[key];
    if (typeof value === 'string' && value.trim() !== '') out[key] = value.trim();
  }
  for (const key of METADATA_STRINGS_ARRAYS) {
    const value = metadata[key];
    if (Array.isArray(value)) {
      const list = value.map(v => String(v).trim()).filter(v => v !== '');
      if (list.length > 0) out[key] = list;
    }
  }
  for (const key of METADATA_BOOLEANS) {
    const value = metadata[key];
    if (typeof value === 'boolean') out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** First asserted printed name across the face slots, for list display. */
export function commitFaceSummary(faces: PrintCommitFace[] | null): string {
  for (const face of faces ?? []) {
    if (face.printedName != null && face.printedName !== '') return face.printedName;
  }
  return '';
}
