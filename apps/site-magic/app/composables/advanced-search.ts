import Parser from '#search/parser';
import { simplify } from '#search/parser/simplify';
import type { Expression } from '#search/parser';
import type { Operator } from '#search/command/types';

// ── State types ──────────────────────────────────────────────────────────────

export type TextModifier = 'default' | 'oracle' | 'unified' | 'printed';

export interface TextFieldState {
  value:    string;
  modifier: TextModifier;
  negate:   boolean;
}

export interface TextOnlyState {
  value:  string;
  negate: boolean;
}

export type ColorOperator = ':' | '=' | '>=' | '<=';

export interface ColorFieldState {
  values:   string[];
  operator: ColorOperator;
  negate:   boolean;
}

export type NumericOperator = ':' | '=' | '>' | '>=' | '<' | '<=';

export interface NumericFieldState {
  value:    string;
  operator: NumericOperator;
  negate:   boolean;
}

export interface DateFieldState {
  value:    string;
  operator: NumericOperator;
  negate:   boolean;
}

export interface FormatFieldState {
  format: string;
  status: string;
  negate: boolean;
}

export interface OrderFieldState {
  value:     string;
  direction: '' | '+' | '-';
}

export interface AdvancedSearchState {
  // Text search
  name:       TextFieldState;
  type:       TextFieldState;
  text:       TextFieldState;
  oracle:     TextOnlyState;
  flavorText: TextOnlyState;
  flavorName: TextOnlyState;

  // Colors
  color:          ColorFieldState;
  colorIdentity:  ColorFieldState;
  colorIndicator: ColorFieldState;

  // Mana
  manaCost:  TextOnlyState;
  manaValue: NumericFieldState;

  // Combat
  power:     NumericFieldState;
  toughness: NumericFieldState;
  loyalty:   NumericFieldState;
  defense:   NumericFieldState;

  // Card face
  rarity: string[];
  layout: string[];
  set:    TextOnlyState;
  lang:   string;
  number: TextOnlyState;

  // Date & format
  date:   DateFieldState;
  format: FormatFieldState;

  // Tags
  keyword: string[];
  counter: string[];

  // Sort
  order: OrderFieldState;
}

// ── Default state ─────────────────────────────────────────────────────────────

function defaultTextFieldState(): TextFieldState {
  return { value: '', modifier: 'default', negate: false };
}

function defaultTextOnlyState(): TextOnlyState {
  return { value: '', negate: false };
}

function defaultColorFieldState(): ColorFieldState {
  return { values: [], operator: ':', negate: false };
}

function defaultNumericFieldState(): NumericFieldState {
  return { value: '', operator: '=', negate: false };
}

function createDefaultState(): AdvancedSearchState {
  return {
    name:           defaultTextFieldState(),
    type:           defaultTextFieldState(),
    text:           defaultTextFieldState(),
    oracle:         defaultTextOnlyState(),
    flavorText:     defaultTextOnlyState(),
    flavorName:     defaultTextOnlyState(),
    color:          defaultColorFieldState(),
    colorIdentity:  defaultColorFieldState(),
    colorIndicator: defaultColorFieldState(),
    manaCost:       defaultTextOnlyState(),
    manaValue:      defaultNumericFieldState(),
    power:          defaultNumericFieldState(),
    toughness:      defaultNumericFieldState(),
    loyalty:        defaultNumericFieldState(),
    defense:        defaultNumericFieldState(),
    rarity:         [],
    layout:         [],
    set:            defaultTextOnlyState(),
    lang:           '',
    number:         defaultTextOnlyState(),
    date:           { value: '', operator: '=', negate: false },
    format:         { format: '', status: '', negate: false },
    keyword:        [],
    counter:        [],
    order:          { value: '', direction: '' },
  };
}

// ── DSL generation ────────────────────────────────────────────────────────────

function quoteValue(v: string): string {
  if (v === '') return '""';
  if (/[\s"()]/.test(v)) {
    return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return v;
}

const TEXT_MOD_CMD: Record<TextModifier, Record<'name' | 'type' | 'text', string>> = {
  default: { name: 'name', type: 'type', text: 'text' },
  oracle:  { name: 'on', type: 'ot', text: 'ox' },
  unified: { name: 'un', type: 'ut', text: 'ux' },
  printed: { name: 'pn', type: 'pt', text: 'px' },
};

function buildTextField(field: TextFieldState, base: 'name' | 'type' | 'text'): string | null {
  if (!field.value) return null;
  const cmd = TEXT_MOD_CMD[field.modifier][base];
  const neg = field.negate ? '!' : '';
  return `${neg}${cmd}:${quoteValue(field.value)}`;
}

function buildTextOnly(field: TextOnlyState, cmd: string): string | null {
  if (!field.value) return null;
  const neg = field.negate ? '!' : '';
  return `${neg}${cmd}:${quoteValue(field.value)}`;
}

function buildColor(field: ColorFieldState, cmd: string): string | null {
  if (field.values.length === 0) return null;
  const neg = field.negate ? '!' : '';
  // Color values are concatenated without separator: WUBR etc.
  return `${neg}${cmd}${field.operator}${field.values.join('')}`;
}

function buildNumeric(field: NumericFieldState, cmd: string): string | null {
  if (!field.value) return null;
  const neg = field.negate ? '!' : '';
  return `${neg}${cmd}${field.operator}${field.value}`;
}

function buildMultiSelect(values: string[], cmd: string): string | null {
  if (values.length === 0) return null;
  if (values.length === 1) return `${cmd}:${values[0]}`;
  return `(${values.map(v => `${cmd}:${v}`).join(' | ')})`;
}

function buildFormat(field: FormatFieldState): string | null {
  if (!field.format) return null;
  const neg = field.negate ? '!' : '';
  const value = field.status ? `${field.format}=${field.status}` : field.format;
  return `${neg}format:${value}`;
}

function buildOrder(field: OrderFieldState): string | null {
  if (!field.value) return null;
  const dir = field.direction ? `:${field.direction}` : '';
  return `order:${field.value}${dir}`;
}

export function buildDSL(state: AdvancedSearchState): string {
  const parts: (string | null)[] = [
    buildTextField(state.name, 'name'),
    buildTextField(state.type, 'type'),
    buildTextField(state.text, 'text'),
    buildTextOnly(state.oracle, 'oracle'),
    buildTextOnly(state.flavorText, 'flavor-text'),
    buildTextOnly(state.flavorName, 'flavor-name'),
    buildColor(state.color, 'color'),
    buildColor(state.colorIdentity, 'color-identity'),
    buildColor(state.colorIndicator, 'color-indicator'),
    buildTextOnly(state.manaCost, 'cost'),
    buildNumeric(state.manaValue, 'mana-value'),
    buildNumeric(state.power, 'power'),
    buildNumeric(state.toughness, 'toughness'),
    buildNumeric(state.loyalty, 'loyalty'),
    buildNumeric(state.defense, 'defense'),
    buildMultiSelect(state.rarity, 'rarity'),
    buildMultiSelect(state.layout, 'layout'),
    buildTextOnly(state.set, 'set'),
    state.lang ? `lang:${state.lang}` : null,
    buildTextOnly(state.number, 'number'),
    buildNumeric(state.date, 'date'),
    buildFormat(state.format),
    ...state.keyword.map(k => `keyword:${quoteValue(k)}`),
    ...state.counter.map(c => `counter:${quoteValue(c)}`),
    buildOrder(state.order),
  ];

  return parts.filter(Boolean).join(' ');
}

// ── Reverse parsing ───────────────────────────────────────────────────────────

/** Mapping from command string -> state field key + optional modifier */
const CMD_MAP: Record<string, { field: string, mod?: TextModifier }> = {
  // name (longest key 6 chars -> value at col 8)
  'name': { field: 'name', mod: 'default' },
  'n':    { field: 'name', mod: 'default' },
  'on':   { field: 'name', mod: 'oracle' },
  'un':   { field: 'name', mod: 'unified' },
  'pn':   { field: 'name', mod: 'printed' },

  // type (longest key 6 chars -> value at col 8)
  'type': { field: 'type', mod: 'default' },
  't':    { field: 'type', mod: 'default' },
  'ot':   { field: 'type', mod: 'oracle' },
  'ut':   { field: 'type', mod: 'unified' },
  'pt':   { field: 'type', mod: 'printed' },

  // text (longest key 6 chars -> value at col 8)
  'text': { field: 'text', mod: 'default' },
  'x':    { field: 'text', mod: 'default' },
  'ox':   { field: 'text', mod: 'oracle' },
  'ux':   { field: 'text', mod: 'unified' },
  'px':   { field: 'text', mod: 'printed' },

  // other text fields (longest key 'flavor-text' 13 chars -> value at col 15)
  'oracle':      { field: 'oracle' },
  'o':           { field: 'oracle' },
  'flavor-text': { field: 'flavorText' },
  'flavor':      { field: 'flavorText' },
  'ft':          { field: 'flavorText' },
  'flavor-name': { field: 'flavorName' },
  'fn':          { field: 'flavorName' },

  // colors (longest key 'color-indicator' 17 chars -> value at col 19)
  'color':           { field: 'color' },
  'c':               { field: 'color' },
  'color-identity':  { field: 'colorIdentity' },
  'identity':        { field: 'colorIdentity' },
  'cd':              { field: 'colorIdentity' },
  'color-indicator': { field: 'colorIndicator' },
  'ci':              { field: 'colorIndicator' },

  // mana (longest key 'mana-value' 12 chars -> value at col 14)
  'cost':       { field: 'manaCost' },
  'mana':       { field: 'manaCost' },
  'mana-cost':  { field: 'manaCost' },
  'm':          { field: 'manaCost' },
  'mana-value': { field: 'manaValue' },
  'mv':         { field: 'manaValue' },
  'cmc':        { field: 'manaValue' },

  // combat (longest key 'toughness' 11 chars -> value at col 13)
  'power':     { field: 'power' },
  'pow':       { field: 'power' },
  'toughness': { field: 'toughness' },
  'tou':       { field: 'toughness' },
  'loyalty':   { field: 'loyalty' },
  'loy':       { field: 'loyalty' },
  'defense':   { field: 'defense' },
  'def':       { field: 'defense' },

  // card face (longest key 'expansion' 11 chars -> value at col 13)
  'set':       { field: 'set' },
  'expansion': { field: 'set' },
  's':         { field: 'set' },
  'e':         { field: 'set' },
  'lang':      { field: 'lang' },
  'l':         { field: 'lang' },
  'number':    { field: 'number' },
  'num':       { field: 'number' },
  'layout':    { field: 'layout' },
  'rarity':    { field: 'rarity' },
  'r':         { field: 'rarity' },

  // date & format (longest key 'release-date' 14 chars -> value at col 16)
  'release-date': { field: 'date' },
  'date':         { field: 'date' },
  'format':       { field: 'format' },
  'f':            { field: 'format' },

  // tags (longest key 'keyword'/'counter' 9 chars -> value at col 11)
  'keyword': { field: 'keyword' },
  'counter': { field: 'counter' },

  // sort
  'order': { field: 'order' },
};

const COLOR_FIELDS = new Set(['color', 'colorIdentity', 'colorIndicator']);
const NUMERIC_FIELDS = new Set(['manaValue', 'power', 'toughness', 'loyalty', 'defense', 'date']);
const MULTI_FIELDS = new Set(['rarity', 'layout', 'keyword', 'counter']);

function applySimpleExpr(expr: Extract<Expression, { type: 'simple' }>, state: AdvancedSearchState): boolean {
  const mapped = CMD_MAP[expr.cmd];
  if (!mapped) return false;

  const { field, mod } = mapped;
  const negate = expr.qual?.includes('!') ?? false;
  const op = expr.op as Operator;
  const args = expr.args as string;

  if (field === 'lang') {
    if (negate) return false;
    (state as any)[field] = args;
    return true;
  }

  if (field === 'order') {
    const match = args.match(/^(.+?)(?::([+-]))?$/);
    if (match) {
      state.order.value = match[1] ?? '';
      state.order.direction = (match[2] as '' | '+' | '-') ?? '';
    }
    return true;
  }

  if (MULTI_FIELDS.has(field)) {
    if (!(state as any)[field].includes(args)) {
      (state as any)[field].push(args);
    }
    return true;
  }

  if (COLOR_FIELDS.has(field)) {
    const colorState = (state as any)[field] as ColorFieldState;
    colorState.values = args.toUpperCase().split('');
    colorState.operator = (op === '' ? ':' : op) as ColorOperator;
    colorState.negate = negate;
    return true;
  }

  if (NUMERIC_FIELDS.has(field)) {
    const numState = (state as any)[field] as NumericFieldState;
    numState.value = args;
    numState.operator = (op === '' ? '=' : op) as NumericOperator;
    numState.negate = negate;
    return true;
  }

  if (field === 'manaCost') {
    state.manaCost.value = args;
    state.manaCost.negate = negate;
    return true;
  }

  if (field === 'format') {
    if (args.includes('=')) {
      const [fmt, status] = args.split('=', 2);
      state.format.format = fmt ?? '';
      state.format.status = status ?? '';
    } else {
      state.format.format = args;
      state.format.status = '';
    }
    state.format.negate = negate;
    return true;
  }

  // Text fields with modifiers (name/type/text)
  if (mod !== undefined) {
    const textState = (state as any)[field] as TextFieldState;
    textState.value = args;
    textState.modifier = mod;
    textState.negate = negate;
    return true;
  }

  // Plain text-only fields (oracle/flavorText/flavorName/set/number)
  const textState = (state as any)[field] as TextOnlyState;
  textState.value = args;
  textState.negate = negate;
  return true;
}

/**
 * Try to apply a single Expression to state.
 * Handles OR groups for rarity/layout.
 * Returns false if the expression is too complex to map.
 */
function applyExpr(expr: Expression, state: AdvancedSearchState): boolean {
  if (expr.type === 'simple') {
    return applySimpleExpr(expr, state);
  }

  // Handle (rarity:X | rarity:Y) OR grouping
  if (expr.type === 'paren' && expr.expr.type === 'logic' && expr.expr.sep === '|') {
    const inner = expr.expr;
    const first = inner.exprs[0];
    if (!first || first.type !== 'simple') return false;
    const mapped = CMD_MAP[first.cmd];
    if (!mapped || !MULTI_FIELDS.has(mapped.field)) return false;

    for (const sub of inner.exprs) {
      if (sub.type !== 'simple' || CMD_MAP[sub.cmd]?.field !== mapped.field) return false;
    }
    for (const sub of inner.exprs) {
      applyExpr(sub, state);
    }
    return true;
  }

  return false;
}

/**
 * Try to parse DSL text into form state.
 * Returns true if fully parsed, false if too complex.
 */
export function parseIntoState(text: string, state: AdvancedSearchState): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;

  try {
    const expr = new Parser(trimmed).parse();
    const simplified = simplify(expr);

    const exprs: Expression[] = (() => {
      // Flat AND at top level
      if (simplified.type === 'logic' && (simplified.sep === '' || simplified.sep === '&')) {
        return simplified.exprs;
      }
      return [simplified];
    })();

    for (const e of exprs) {
      if (!applyExpr(e, state)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

// ── Composable ────────────────────────────────────────────────────────────────

export function useAdvancedSearch() {
  const searchInput = useSearchInput();

  const state = ref<AdvancedSearchState>(createDefaultState());
  const cannotParse = ref(false);
  const internalSync = ref(false);

  // searchInput → form state (reverse parse)
  watch(
    searchInput,
    q => {
      if (internalSync.value) {
        internalSync.value = false;
        return;
      }

      const fresh = createDefaultState();
      const ok = parseIntoState(q ?? '', fresh);
      cannotParse.value = !ok;
      state.value = fresh;
    },
    { immediate: true },
  );

  // form state → searchInput (DSL generation)
  watch(
    state,
    newState => {
      const dsl = buildDSL(newState);
      if (dsl !== searchInput.value) {
        internalSync.value = true;
        searchInput.value = dsl;
      }
    },
    { deep: true },
  );

  function reset() {
    internalSync.value = true;
    state.value = createDefaultState();
    searchInput.value = '';
  }

  const dsl = computed(() => buildDSL(state.value));

  return { state, dsl, cannotParse, reset };
}
