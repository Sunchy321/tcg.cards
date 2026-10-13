import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

/** Which game-specific announcement fields the editor form exposes. */
export interface AnnouncementFormFields {
  /** Hearthstone build-number fields: announcement-level version/lastVersion and their item overrides. */
  versionFields: boolean;
  /** Magic date-based comparison version: announcement-level prevVersion and its item override. */
  prevVersion: boolean;
  /** Magic per-platform effective dates (tabletop/online/arena) plus the next-check date. */
  platformDates: boolean;
  /** Hearthstone item delta/glow JSON editors. */
  deltaGlow: boolean;
}

/** The type/status declaration of a game's model, driving normalization and validation. */
export interface AnnouncementFormConfig {
  types: string[];
  statusByType: Record<string, { statuses: string[], default: string | null }>;
  fields: AnnouncementFormFields;
}

/** One link entry of the editor form. */
export interface AnnouncementFormLink {
  url: string;
  label: string;
}

/** One announcement item in the editor's plain data shape. */
export interface AnnouncementFormItemData {
  type:          string;
  status:        string;
  effectiveDate: string;
  format:        string;
  group:         string;
  prevVersion:   string;
  version:       number | null;
  lastVersion:   number | null;
  cardId:        string;
  setId:         string;
  ruleId:        string;
  relatedCards:  string;
  score:         number | null;
  delta:         string;
  glow:          string;
}

/** The announcement in the editor's plain data shape; dates and versions are strings/numbers as the inputs hold them. */
export interface AnnouncementFormData {
  source:                string;
  date:                  string;
  effectiveDate:         string;
  effectiveDateTabletop: string;
  effectiveDateOnline:   string;
  effectiveDateArena:    string;
  nextDate:              string;
  prevVersion:           string;
  version:               number | null;
  lastVersion:           number | null;
  name:                  string;
  link:                  AnnouncementFormLink[];
  items:                 AnnouncementFormItemData[];
}

/** The status a type's dropdown shows: the declared statuses of that type, labeled by the caller. */
export function statusOptionsOfType(type: string, config: AnnouncementFormConfig): string[] {
  return config.statusByType[type]?.statuses ?? [];
}

/** The status a type normalizes to: the type default when empty, empty string for statusless types. */
export function normalizeItemStatus(type: string, status: string, config: AnnouncementFormConfig): string {
  const declared = config.statusByType[type];
  if (declared == null || declared.statuses.length === 0) {
    return '';
  }
  if (status === '') {
    return declared.default ?? '';
  }
  return declared.statuses.includes(status) ? status : (declared.default ?? '');
}

/** Parse a comma-separated related-cards input into its id list. */
export function parseRelatedCards(value: string): string[] {
  return value.split(',').map(v => v.trim()).filter(Boolean);
}

function parseJsonSafe(value: string): unknown {
  if (!value.trim()) {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function emptyItem(type: string, status: string): AnnouncementFormItemData {
  return {
    type,
    status,
    effectiveDate: '',
    format:        '',
    group:         '',
    prevVersion:   '',
    version:       null,
    lastVersion:   null,
    cardId:        '',
    setId:         '',
    ruleId:        '',
    relatedCards:  '',
    score:         null,
    delta:         '',
    glow:          '',
  };
}

/** The default item type new items start with; the first declared type carrying a default status wins. */
export function defaultItemType(config: AnnouncementFormConfig): string {
  const withDefault = config.types.find(type => config.statusByType[type]?.default != null);
  return withDefault ?? config.types[0] ?? 'card_update';
}

/** Seed a fresh item of the given type with its normalized default status. */
export function newFormItem(type: string, config: AnnouncementFormConfig): AnnouncementFormItemData {
  return emptyItem(type, normalizeItemStatus(type, '', config));
}

/** Serialize the form into YAML; flagged-off fields are omitted entirely. */
export function announcementToYaml(form: AnnouncementFormData, config: AnnouncementFormConfig): string {
  const { fields } = config;
  const data: Record<string, unknown> = {
    source:        form.source,
    date:          form.date,
    effectiveDate: form.effectiveDate || null,
    name:          form.name,
    link:          form.link.filter(l => l.url),
    items:         form.items.map(item => {
      const row: Record<string, unknown> = {
        type:          item.type,
        effectiveDate: item.effectiveDate || null,
        format:        item.format || null,
        status:        normalizeItemStatus(item.type, item.status, config) || null,
        score:         item.score ?? null,
        group:         item.group || null,
        cardId:        item.cardId || null,
        setId:         item.setId || null,
        ruleId:        item.ruleId || null,
        relatedCards:  parseRelatedCards(item.relatedCards),
      };
      if (fields.prevVersion) {
        row.prevVersion = item.prevVersion || null;
      }
      if (fields.versionFields) {
        row.version = item.version ?? null;
        row.lastVersion = item.lastVersion ?? null;
      }
      if (fields.deltaGlow) {
        row.delta = parseJsonSafe(item.delta);
        row.glow = parseJsonSafe(item.glow);
      }
      return row;
    }),
  };
  if (fields.platformDates) {
    data.effectiveDateTabletop = form.effectiveDateTabletop || null;
    data.effectiveDateOnline = form.effectiveDateOnline || null;
    data.effectiveDateArena = form.effectiveDateArena || null;
    data.nextDate = form.nextDate || null;
  }
  if (fields.prevVersion) {
    data.prevVersion = form.prevVersion || null;
  }
  if (fields.versionFields) {
    data.version = form.version;
    data.lastVersion = form.lastVersion ?? null;
  }
  return stringifyYaml(data, { indent: 2 });
}

/** Parse YAML into the form data shape, validating types and per-type statuses. */
export function yamlToAnnouncement(text: string, config: AnnouncementFormConfig): { ok: true, form: AnnouncementFormData } | { ok: false, errors: string[] } {
  let data: any;
  try {
    data = parseYaml(text);
  } catch (error) {
    return { ok: false, errors: [error instanceof Error ? error.message : 'YAML 解析失败'] };
  }
  if (data == null || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, errors: ['YAML 内容不是公告对象'] };
  }

  const errors: string[] = [];
  const { fields } = config;

  const items: AnnouncementFormItemData[] = [];
  if (data.items !== undefined) {
    if (!Array.isArray(data.items)) {
      return { ok: false, errors: ['items 必须是列表'] };
    }
    data.items.forEach((raw: any, index: number) => {
      const type = String(raw?.type ?? '');
      if (!config.types.includes(type)) {
        errors.push(`条目 ${index + 1}: type 非法 (${type || '空'})`);
        return;
      }
      const status = raw?.status == null ? '' : String(raw.status);
      const declared = config.statusByType[type]!;
      if (status !== '' && !declared.statuses.includes(status)) {
        errors.push(`条目 ${index + 1}: status 非法 (${status})`);
        return;
      }
      items.push({
        type,
        status:        normalizeItemStatus(type, status, config),
        effectiveDate: raw?.effectiveDate == null ? '' : String(raw.effectiveDate),
        format:        raw?.format == null ? '' : String(raw.format),
        group:         raw?.group == null ? '' : String(raw.group),
        prevVersion:   fields.prevVersion && raw?.prevVersion != null ? String(raw.prevVersion) : '',
        version:       fields.versionFields && typeof raw?.version === 'number' ? raw.version : null,
        lastVersion:   fields.versionFields && typeof raw?.lastVersion === 'number' ? raw.lastVersion : null,
        cardId:        raw?.cardId == null ? '' : String(raw.cardId),
        setId:         raw?.setId == null ? '' : String(raw.setId),
        ruleId:        raw?.ruleId == null ? '' : String(raw.ruleId),
        relatedCards:  Array.isArray(raw?.relatedCards) ? raw.relatedCards.join(', ') : '',
        score:         typeof raw?.score === 'number' ? raw.score : null,
        delta:         fields.deltaGlow && raw?.delta != null ? JSON.stringify(raw.delta, null, 2) : '',
        glow:          fields.deltaGlow && raw?.glow != null ? JSON.stringify(raw.glow, null, 2) : '',
      });
    });
    if (errors.length > 0) {
      return { ok: false, errors };
    }
  }

  const form: AnnouncementFormData = {
    source:                data.source == null ? '' : String(data.source),
    date:                  data.date == null ? '' : String(data.date),
    effectiveDate:         data.effectiveDate == null ? '' : String(data.effectiveDate),
    effectiveDateTabletop: fields.platformDates && data.effectiveDateTabletop != null ? String(data.effectiveDateTabletop) : '',
    effectiveDateOnline:   fields.platformDates && data.effectiveDateOnline != null ? String(data.effectiveDateOnline) : '',
    effectiveDateArena:    fields.platformDates && data.effectiveDateArena != null ? String(data.effectiveDateArena) : '',
    nextDate:              fields.platformDates && data.nextDate != null ? String(data.nextDate) : '',
    prevVersion:           fields.prevVersion && data.prevVersion != null ? String(data.prevVersion) : '',
    version:               fields.versionFields && typeof data.version === 'number' ? data.version : null,
    lastVersion:           fields.versionFields && typeof data.lastVersion === 'number' ? data.lastVersion : null,
    name:                  data.name == null ? '' : String(data.name),
    link:                  Array.isArray(data.link)
      ? data.link.map((l: any) => ({ url: String(l?.url ?? ''), label: l?.label == null ? '' : String(l.label) }))
      : [],
    items,
  };
  return { ok: true, form };
}
