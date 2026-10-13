/**
 * Name ruby (phonetic annotation) — the annotation-string format of ADR 0013.
 *
 * An annotation string interleaves base-text runs with kana readings in
 * parentheses: `包囲（ほうい）の搭（とう）`. A reading annotates the base run
 * immediately before it and contains only kana — never a parenthesis — which
 * keeps the format parseable without ambiguity. Full-width parentheses are the
 * storage form; half-width parentheses are accepted on input and normalized.
 *
 * An annotation whose base runs do not concatenate back to the displayed name
 * is dropped rather than rendered: a wrong or misplaced ruby is worse than no
 * ruby, and absence degrades to the plain name.
 */

export type NameRubyKind = 'name' | 'flavor_name';
export type NameRubyStatus = 'draft' | 'reviewed';

/** One parsed run; `ruby` is present only on annotated runs. */
export interface NameRubySegment {
  text:  string;
  ruby?: string;
}

const FULL_WIDTH_OPEN = '（';
const FULL_WIDTH_CLOSE = '）';
/** Hiragana, voiced marks, katakana, the middle dot, the long-vowel mark and iteration marks. */
const KANA_RE = /^[\u3041-\u3096\u3099-\u309F\u30A1-\u30FA\u30FB\u30FC\u30FD-\u30FF]+$/;

function isKana(ch: string): boolean {
  return KANA_RE.test(ch);
}

/** Normalize the half-width parentheses of an incoming annotation to full-width. */
export function normalizeRubyParens(annotation: string): string {
  return annotation.replaceAll('(', FULL_WIDTH_OPEN).replaceAll(')', FULL_WIDTH_CLOSE);
}

/**
 * Parse an annotation string into base/reading segments. A reading annotates
 * exactly the non-kana run that touches its opening parenthesis — the base run
 * of `包囲（ほうい）の搭（とう）` is `搭`, never `の搭` — and kana before that run
 * within the same gap are literal. Base runs are emitted verbatim (never
 * normalized). Returns null — reject, don't guess — when a parenthesis pair is
 * unbalanced or mixed-width, when a reading is not pure kana, or when a
 * reading has no base run to annotate.
 */
export function parseNameRuby(annotation: string): NameRubySegment[] | null {
  const segments: NameRubySegment[] = [];
  let gap = '';
  let i = 0;
  while (i < annotation.length) {
    const ch = annotation[i]!;
    if (ch === '(' || ch === FULL_WIDTH_OPEN) {
      const close = annotation.indexOf(ch === '(' ? ')' : FULL_WIDTH_CLOSE, i + 1);
      if (close === -1) return null;
      const ruby = annotation.slice(i + 1, close);
      if (!KANA_RE.test(ruby)) return null;
      // The annotated base is the trailing non-kana run of the gap; kana
      // before it in the same gap are literal text.
      let start = gap.length;
      while (start > 0 && !isKana(gap[start - 1]!)) start--;
      const literal = gap.slice(0, start);
      const base = gap.slice(start);
      if (base === '') return null;
      if (literal !== '') segments.push({ text: literal });
      segments.push({ text: base, ruby });
      gap = '';
      i = close + 1;
      continue;
    }
    if (ch === ')' || ch === FULL_WIDTH_CLOSE) return null;
    gap += ch;
    i++;
  }
  if (gap !== '') segments.push({ text: gap });
  if (!segments.some(s => s.ruby != null)) return null;
  return segments;
}

/**
 * Validate an annotation against the name it must render as, returning the
 * normalized storage form, or null when the pair is malformed or the base runs
 * do not concatenate back to the name exactly.
 */
export function validateNameRuby(name: string, annotation: string): string | null {
  const normalized = normalizeRubyParens(annotation);
  const segments = parseNameRuby(normalized);
  if (segments == null) return null;
  return segments.map(s => s.text).join('') === name ? normalized : null;
}

/** The flat kana reading of an annotation — what kana search and kana ordering consume. */
export function flattenNameRuby(segments: NameRubySegment[]): string {
  return segments.map(s => s.ruby ?? s.text).join('');
}

const KANA_TAIL_RE = /^[-ぁ-んァ-ヶーー]*$/;

/**
 * Tolerantly strip inline furigana glosses that upstream flattened into a
 * Japanese surface string — `反（はん）射（しゃ）池（いけ）` → `反射池` — including
 * dangling truncated glosses (`…軍旗手（しゅ`) and stray/nested parentheses
 * (`…子（（し）の…`). Unlike {@link parseNameRuby} this never rejects: cleaning
 * must not fail on malformed data. Only kana-reading parentheses are removed;
 * a parenthesis whose content is not kana is kept (Japanese card names carry
 * no literal parentheses, but the cleaner stays conservative).
 */
export function stripNameRuby(text: string): string {
  const remove = new Array<boolean>(text.length).fill(false);
  const stack: number[] = [];
  const pairClose = new Map<number, number>();

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === '（' || ch === '(') stack.push(i);
    else if (ch === '）' || ch === ')') {
      const open = stack.pop();
      if (open == null) remove[i] = true;
      else pairClose.set(open, i);
    }
  }
  for (const open of stack) {
    // An unclosed open is either a truncated gloss — all kana to the end of
    // the string, remove the tail — or a nesting artifact; drop the character.
    remove[open] = true;
    if (KANA_TAIL_RE.test(text.slice(open + 1))) {
      for (let i = open + 1; i < text.length; i++) remove[i] = true;
    }
  }

  let out = '';
  for (let i = 0; i < text.length; i++) {
    if (remove[i]) continue;
    const ch = text[i]!;
    if (ch === '（' || ch === '(') {
      const close = pairClose.get(i);
      if (close != null) {
        const content = text.slice(i + 1, close);
        if (content === '' || KANA_RE.test(content)) {
          i = close;
          continue;
        }
      }
    }
    out += ch;
  }
  return out;
}

/** One reviewed mapping row of the ruby authority, projected for lookup. */
export interface NameRubyEntry {
  rubyName:   string;
  /** Per-print overrides keyed `set:number` — same name, different printed reading. */
  exceptions: Record<string, string> | null;
}

/** Reviewed rows of the ruby authority keyed by {@link nameRubyKey}. */
export type NameRubyLookup = Map<string, NameRubyEntry>;

export function nameRubyKey(lang: string, kind: NameRubyKind, name: string): string {
  return `${lang}\u0000${kind}\u0000${name}`;
}

export interface NameRubyQuery {
  lang:    string;
  kind:    NameRubyKind;
  name:    string;
  set?:    string | null;
  number?: string | null;
}

/**
 * Resolve the annotation for one name at one printing. The `set:number`
 * exception wins when present; the resolved value comes back in the normalized
 * storage form (full-width parentheses). A corrupt entry — unparseable, or
 * whose base runs do not rebuild the name — resolves to null, never to a guess.
 */
export function resolveNameRuby(lookup: NameRubyLookup, query: NameRubyQuery): string | null {
  const entry = lookup.get(nameRubyKey(query.lang, query.kind, query.name));
  if (entry == null) return null;
  const exceptionKey = query.set != null && query.number != null ? `${query.set}:${query.number}` : null;
  const candidates = [
    exceptionKey != null ? entry.exceptions?.[exceptionKey] : undefined,
    entry.rubyName,
  ];
  for (const candidate of candidates) {
    if (candidate == null) continue;
    const normalized = validateNameRuby(query.name, candidate);
    if (normalized != null) return normalized;
  }
  return null;
}
