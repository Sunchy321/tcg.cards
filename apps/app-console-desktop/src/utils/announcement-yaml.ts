import {
  changeStatus,
  gameChangeType,
  glowPart,
  glowType,
  group as groupEnum,
} from '@tcg-cards/model/src/hearthstone/schema/announcement';
import {
  isMap,
  isScalar,
  isSeq,
  parseAllDocuments,
  stringify,
  type YAMLMap,
} from 'yaml';

/** One card matched by the local card search RPC. */
export interface CardSearchResult {
  cardId: string;
  nameEn: string | null;
  nameZh: string | null;
  set:    string | null;
  type:   string | null;
}

/** One card resolved by exact cardId from the local card search RPC. */
export interface ResolvedCardName {
  cardId: string;
  nameEn: string | null;
  nameZh: string | null;
}

/** A card change item as represented in the text mode YAML. */
export interface TextItem {
  type:          string;
  effectiveDate: string;
  format:        string;
  status:        string;
  group:         string;
  version?:      number;
  lastVersion?:  number;
  cardId:        string;
  setId:         string;
  ruleId:        string;
  relatedCards:  string[];
  delta:         Record<string, unknown> | null;
  glow:          { part: string, type: string }[] | null;
}

/** One structural or field error located at a 1-based YAML line. */
export interface ParseError {
  line:    number;
  message: string;
}

/** A `cardId: name:<query>` search trigger awaiting expansion into candidate cardIds. */
export interface SearchTrigger {
  line: number;
  /** Text range of the `cardId:` value, for rewriting once the search completes. */
  from: number;
  to: number;
  query: string;
  /** Whether candidate cardIds were already appended after the query (comma present). */
  expanded: boolean;
}

export interface ParsedResult {
  items: TextItem[];
  errors: ParseError[];
  searches: SearchTrigger[];
}

/** Entity reference kind by change type; null when the type carries no entity id. */
export function idKindOf(type: string): 'card' | 'set' | 'rule' | null {
  if (type === 'card_change' || type === 'card_update') return 'card';
  if (type === 'set_change') return 'set';
  if (type === 'rule_change') return 'rule';
  return null;
}

const KNOWN_KEYS = new Set([
  'type', 'format', 'status', 'group', 'effectiveDate', 'version', 'lastVersion',
  'cardId', 'setId', 'ruleId', 'relatedCards', 'delta', 'glow',
]);

function emptyItem(type: string): TextItem {
  return {
    type,
    effectiveDate: '',
    format:        '',
    status:        '',
    group:         '',
    cardId:        '',
    setId:         '',
    ruleId:        '',
    relatedCards:  [],
    delta:         null,
    glow:          null,
  };
}

/** Serializes items to a YAML list, omitting nullish and empty fields. */
export function serializeItems(items: TextItem[]): string {
  return stringify(items.map(item => {
    const out: Record<string, unknown> = { type: item.type };
    if (item.status) out.status = item.status;
    if (item.format) out.format = item.format;
    if (item.group) out.group = item.group;
    if (item.effectiveDate) out.effectiveDate = item.effectiveDate;
    if (item.version != null) out.version = item.version;
    if (item.lastVersion != null) out.lastVersion = item.lastVersion;
    if (item.cardId) out.cardId = item.cardId;
    if (item.setId) out.setId = item.setId;
    if (item.ruleId) out.ruleId = item.ruleId;
    if (item.relatedCards.length > 0) out.relatedCards = item.relatedCards;
    if (item.delta && Object.keys(item.delta).length > 0) out.delta = item.delta;
    if (item.glow && item.glow.length > 0) out.glow = item.glow;
    return out;
  }), { indent: 2 });
}

/** Builds a name resolver that caches candidates and dedupes in-flight requests. */
export function createNameResolver(resolve: (name: string) => Promise<CardSearchResult[]>) {
  const cache = new Map<string, CardSearchResult[]>();
  const inflight = new Map<string, Promise<CardSearchResult[]>>();
  return async (name: string) => {
    const key = name.trim();
    const cached = cache.get(key);
    if (cached) return cached;
    const running = inflight.get(key);
    if (running) return running;
    const promise = resolve(key).then(candidates => {
      inflight.delete(key);
      cache.set(key, candidates);
      return candidates;
    });
    inflight.set(key, promise);
    return promise;
  };
}

function toInt(value: unknown): number | undefined {
  if (value == null) return undefined;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && Number.isInteger(n) ? n : undefined;
}

/** Node [start, end, nodeEnd] text range, when the node carries one. */
function nodeRange(node: unknown): [number, number, number?] | undefined {
  if (node == null) return undefined;
  return (node as { range?: [number, number, number?] }).range;
}

/** Parses the text mode YAML into items, errors, and unresolved card names. */
export function parseItemsYaml(text: string): ParsedResult {
  const errors: ParseError[] = [];
  const searches: SearchTrigger[] = [];
  const items: TextItem[] = [];

  const docs = parseAllDocuments(text);
  if (docs.length > 1) {
    return { items, errors: [{ line: 1, message: '顶层必须是单个条目列表（去掉多余的 --- 分隔）' }], searches };
  }
  const doc = docs[0];
  if (!doc) return { items, errors, searches };
  if (doc.errors.length > 0) {
    return {
      items,
      errors: doc.errors.map(error => ({
        line:    error.linePos?.[0]?.line ?? 0,
        message: error.message,
      })),
      searches,
    };
  }

  // Precomputed start offsets of every line for O(log n) offset→line lookup.
  // Slicing the document per call would make parsing super-linear for large docs.
  const lineStarts: number[] = [0];
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) lineStarts.push(i + 1);
  }
  const lineOf = (offset: number | undefined): number => {
    if (offset == null) return 0;
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid]! <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };

  const parseItem = (itemMap: YAMLMap): void => {
    const itemLine = lineOf(itemMap.range?.[0]);
    const itemErrors: { line: number, message: string }[] = [];
    const raw: Record<string, unknown> = {};
    let cardIdValueRange: [number, number] | null = null;

    for (const pair of itemMap.items) {
      if (!pair.key || !isScalar(pair.key)) {
        itemErrors.push({ line: itemLine, message: '条目键必须是标量' });
        continue;
      }
      const key = String(pair.key.value);
      if (!KNOWN_KEYS.has(key)) {
        itemErrors.push({ line: lineOf(pair.key.range?.[0]), message: `未知字段: ${key}` });
        continue;
      }
      raw[key] = (pair.value as { toJSON?: () => unknown })?.toJSON?.() ?? null;
      if (key === 'cardId') {
        const valueRange = nodeRange(pair.value);
        if (valueRange) cardIdValueRange = [valueRange[0], valueRange[1]];
      }
    }

    const type = String(raw.type ?? '');
    if (!type) itemErrors.push({ line: itemLine, message: '缺少必填字段 type' });
    else if (!gameChangeType.options.includes(type as never)) itemErrors.push({ line: itemLine, message: `type 非法: ${type}` });

    const status = raw.status == null ? '' : String(raw.status);
    if (status && !changeStatus.options.includes(status as never)) itemErrors.push({ line: itemLine, message: `status 非法: ${status}` });

    const group = raw.group == null ? '' : String(raw.group);
    if (group && !groupEnum.options.includes(group as never)) itemErrors.push({ line: itemLine, message: `group 非法: ${group}` });

    const version = toInt(raw.version);
    if (raw.version != null && version == null) itemErrors.push({ line: itemLine, message: 'version 必须是整数' });
    const lastVersion = toInt(raw.lastVersion);
    if (raw.lastVersion != null && lastVersion == null) itemErrors.push({ line: itemLine, message: 'lastVersion 必须是整数' });

    const cardIdValue = raw.cardId == null ? '' : String(raw.cardId).trim();
    const setId = raw.setId == null ? '' : String(raw.setId).trim();
    const ruleId = raw.ruleId == null ? '' : String(raw.ruleId).trim();

    const effectiveDate = raw.effectiveDate == null ? '' : String(raw.effectiveDate);
    const format = raw.format == null ? '' : String(raw.format);

    let relatedCards: string[] = [];
    if (raw.relatedCards != null) {
      relatedCards = Array.isArray(raw.relatedCards)
        ? raw.relatedCards.map(value => String(value).trim()).filter(Boolean)
        : String(raw.relatedCards).split(',').map(value => value.trim()).filter(Boolean);
    }

    let delta: Record<string, unknown> | null = null;
    if (raw.delta != null) {
      if (raw.delta && typeof raw.delta === 'object' && !Array.isArray(raw.delta)) {
        const keys = Object.keys(raw.delta);
        if (keys.every(key => key === 'prev' || key === 'curr')) delta = raw.delta as Record<string, unknown>;
        else itemErrors.push({ line: itemLine, message: 'delta 只允许 prev/curr 两侧' });
      } else {
        itemErrors.push({ line: itemLine, message: 'delta 必须是对象' });
      }
    }

    let glow: { part: string, type: string }[] | null = null;
    if (raw.glow != null) {
      if (Array.isArray(raw.glow)) {
        glow = [];
        for (const entry of raw.glow) {
          if (!entry || typeof entry !== 'object') {
            itemErrors.push({ line: itemLine, message: 'glow 条目必须是对象' });
            glow = null;
            break;
          }
          const part = String((entry as { part?: unknown }).part ?? '');
          const typeName = String((entry as { type?: unknown }).type ?? '');
          if (!glowPart.options.includes(part as never) || !glowType.options.includes(typeName as never)) {
            itemErrors.push({ line: itemLine, message: `glow 非法: ${part}/${typeName}` });
            glow = null;
            break;
          }
          glow.push({ part, type: typeName });
        }
      } else {
        itemErrors.push({ line: itemLine, message: 'glow 必须是数组' });
      }
    }

    const kind = idKindOf(type);
    if (kind === 'card') {
      if (setId) itemErrors.push({ line: itemLine, message: 'card 类型不能设置 setId' });
      if (ruleId) itemErrors.push({ line: itemLine, message: 'card 类型不能设置 ruleId' });
    } else if (kind === 'set') {
      if (cardIdValue) itemErrors.push({ line: itemLine, message: 'set 类型不能设置 cardId' });
      if (ruleId) itemErrors.push({ line: itemLine, message: 'set 类型不能设置 ruleId' });
    } else if (kind === 'rule') {
      if (cardIdValue) itemErrors.push({ line: itemLine, message: 'rule 类型不能设置 cardId' });
      if (setId) itemErrors.push({ line: itemLine, message: 'rule 类型不能设置 setId' });
    }

    if (itemErrors.length > 0) {
      errors.push(...itemErrors);
      return;
    }

    // `cardId: name:<query>` is a search trigger awaiting expansion into candidates.
    // The query runs to the first ` result:` marker (appended candidates), so
    // multi-word names need no quoting; a plain trigger has no marker.
    if (cardIdValue.startsWith('name:')) {
      const rest = cardIdValue.slice('name:'.length).trimStart();
      const marker = ' result:';
      const markerIndex = rest.indexOf(marker);
      const query = markerIndex !== -1 ? rest.slice(0, markerIndex).trim() : rest.trim();
      if (!query) {
        errors.push({ line: itemLine, message: 'cardId: name: 后需跟搜索词' });
        return;
      }
      searches.push({
        line:     lineOf(cardIdValueRange?.[0] ?? itemLine),
        from:     cardIdValueRange?.[0] ?? 0,
        to:       cardIdValueRange?.[1] ?? 0,
        query,
        // Candidates are appended after a ` result:` marker; a plain trigger has
        // none. Detecting by marker (not comma) covers single- and multi-candidate
        // expansions and prevents re-search loops.
        expanded: markerIndex !== -1,
      });
      return;
    }

    const item = emptyItem(type);
    item.effectiveDate = effectiveDate;
    item.format = format;
    item.status = status;
    item.group = group;
    item.version = version;
    item.lastVersion = lastVersion;
    item.setId = setId;
    item.ruleId = ruleId;
    item.relatedCards = relatedCards;
    item.delta = delta;
    item.glow = glow;
    if (kind === 'card') item.cardId = cardIdValue;

    items.push(item);
  };

  const root = doc.contents;
  if (root != null) {
    if (isSeq(root)) {
      for (const node of root.items) {
        if (node == null) continue;
        if (isMap(node)) parseItem(node);
        else errors.push({ line: lineOf(node.range?.[0]), message: '条目必须是键值映射' });
      }
    } else if (isMap(root)) {
      parseItem(root);
    } else {
      errors.push({ line: lineOf(root.range?.[0]), message: '顶层必须是条目列表或单个条目' });
    }
  }

  return { items, errors, searches };
}
