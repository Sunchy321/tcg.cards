import Parser from '#search/parser';
import { simplify } from '#search/parser/simplify';
import type { Expression, SimpleExpr } from '#search/parser';

export type NumericOperator = '=' | '>' | '>=' | '<' | '<=';

export interface NumericFieldState {
  value:    string;
  operator: NumericOperator;
}

export interface OrderFieldState {
  value:     string;
  direction: '' | '+' | '-';
}

export interface AdvancedSearchState {
  keyword:      string;
  classes:      string[];
  types:        string[];
  races:        string[];
  factions:     string[];
  spellSchools: string[];
  rarities:     string[];
  costs:        string[];
  cost:         [NumericFieldState, NumericFieldState];
  attacks:      string[];
  attack:       [NumericFieldState, NumericFieldState];
  healths:      string[];
  health:       [NumericFieldState, NumericFieldState];
  format:       string;
}

const defaultNumericFieldState = (): NumericFieldState => ({
  value:    '',
  operator: '>=',
});

const createDefaultState = (): AdvancedSearchState => ({
  keyword:      '',
  classes:      [],
  types:        [],
  races:        [],
  factions:     [],
  spellSchools: [],
  rarities:     [],
  costs:        [],
  cost:         [defaultNumericFieldState(), defaultNumericFieldState()],
  attacks:      [],
  attack:       [defaultNumericFieldState(), defaultNumericFieldState()],
  healths:      [],
  health:       [defaultNumericFieldState(), defaultNumericFieldState()],
  format:       '',
});

const quoteValue = (value: string) => {
  if (value === '') {
    return '""';
  }

  if (/[\s"()]/.test(value)) {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }

  return value;
};

const buildText = (command: string, value: string) => {
  const trimmed = value.trim();

  if (trimmed === '') {
    return null;
  }

  return `${command}:${quoteValue(trimmed)}`;
};

const buildNumeric = (command: string, state: NumericFieldState) => {
  if (state.value.trim() === '') {
    return null;
  }

  return `${command}${state.operator}${state.value.trim()}`;
};

const buildMulti = (command: string, values: string[]) => {
  if (values.length === 0) {
    return null;
  }

  if (values.length === 1) {
    return `${command}:${values[0]}`;
  }

  return `(${values.map(value => `${command}:${value}`).join(' | ')})`;
};

const buildNumericChips = (command: string, values: string[]) => {
  if (values.length === 0) {
    return null;
  }

  const queries = values.map(value => value === '10+' ? `${command}>=10` : `${command}=${value}`);

  if (queries.length === 1) {
    return queries[0] ?? null;
  }

  return `(${queries.join(' | ')})`;
};

const buildOrder = (state: OrderFieldState) => {
  if (state.value === '') {
    return null;
  }

  return `order:${state.value}${state.direction}`;
};

export const buildAdvancedSearchDSL = (state: AdvancedSearchState) => {
  const parts = [
    state.keyword.trim() || null,
    buildMulti('class', state.classes),
    buildMulti('type', state.types),
    buildMulti('race', state.races),
    buildMulti('faction', state.factions),
    buildMulti('spell-school', state.spellSchools),
    buildMulti('rarity', state.rarities),
    buildNumericChips('cost', state.costs),
    buildNumeric('cost', state.cost[0]),
    buildNumeric('cost', state.cost[1]),
    buildNumericChips('attack', state.attacks),
    buildNumeric('attack', state.attack[0]),
    buildNumeric('attack', state.attack[1]),
    buildNumericChips('health', state.healths),
    buildNumeric('health', state.health[0]),
    buildNumeric('health', state.health[1]),
    state.format !== '' ? `format:${state.format}` : null,
  ];

  return parts.filter(Boolean).join(' ');
};

// ── Reverse parsing (DSL → State) ──────────────────────────────────────────

function applySimpleExpr(expr: SimpleExpr, state: AdvancedSearchState): void {
  // Skip negated expressions — the visual panel has no way to represent exclusion
  if (expr.qual?.includes('!')) return;

  const { cmd, op, args } = expr;

  switch (cmd) {
  // Multi-select chip fields
  case 'class':
    if (!state.classes.includes(args)) state.classes.push(args);
    break;
  case 'type':
    if (!state.types.includes(args)) state.types.push(args);
    break;
  case 'race':
    if (!state.races.includes(args)) state.races.push(args);
    break;
  case 'faction':
    if (!state.factions.includes(args)) state.factions.push(args);
    break;
  case 'spell-school':
    if (!state.spellSchools.includes(args)) state.spellSchools.push(args);
    break;
  case 'rarity':
    if (!state.rarities.includes(args)) state.rarities.push(args);
    break;

    // Numeric chip fields (exact match 0-9 → chip, operator → numeric input)
  case 'cost': {
    if (op === '=' && /^\d+$/.test(args) && Number(args) <= 10) {
      if (!state.costs.includes(args)) state.costs.push(args);
    } else {
      const slot = state.cost[0].value === '' ? 0 : 1;
      state.cost[slot] = { value: args, operator: op as NumericOperator };
    }
    break;
  }
  case 'attack': {
    if (op === '=' && /^\d+$/.test(args) && Number(args) <= 10) {
      if (!state.attacks.includes(args)) state.attacks.push(args);
    } else {
      const slot = state.attack[0].value === '' ? 0 : 1;
      state.attack[slot] = { value: args, operator: op as NumericOperator };
    }
    break;
  }
  case 'health': {
    if (op === '=' && /^\d+$/.test(args) && Number(args) <= 10) {
      if (!state.healths.includes(args)) state.healths.push(args);
    } else {
      const slot = state.health[0].value === '' ? 0 : 1;
      state.health[slot] = { value: args, operator: op as NumericOperator };
    }
    break;
  }

  // Select field
  case 'format':
    state.format = args;
    break;

    // Unknown commands silently ignored
  }
}

function applyExpr(expr: Expression, state: AdvancedSearchState): void {
  if (expr.type === 'raw') {
    state.keyword = expr.args;
    return;
  }

  if (expr.type === 'simple') {
    applySimpleExpr(expr, state);
    return;
  }

  // Handle (cost:3 | cost:4) OR groups for multi-value fields
  if (expr.type === 'paren' && expr.expr.type === 'logic' && expr.expr.sep === '|') {
    for (const sub of expr.expr.exprs) {
      if (sub.type === 'simple') {
        applySimpleExpr(sub, state);
      }
    }
  }
}

export function parseIntoState(text: string, state: AdvancedSearchState): void {
  const trimmed = text.trim();
  if (!trimmed) return;

  try {
    const expr = new Parser(trimmed).parse();
    const simplified = simplify(expr);

    // Flatten top-level AND groups
    const exprs: Expression[] = simplified.type === 'logic' && (simplified.sep === '' || simplified.sep === '&')
      ? simplified.exprs
      : [simplified];

    for (const e of exprs) {
      applyExpr(e, state);
    }
  } catch {
    // Parse error: leave state as-is (default/empty)
  }
}

export const useAdvancedSearch = () => {
  const state = ref<AdvancedSearchState>(createDefaultState());
  const searchInput = useSearchInput();

  const dsl = computed(() => buildAdvancedSearchDSL(state.value));

  watch(dsl, value => {
    searchInput.value = value;
  });

  const reset = () => {
    state.value = createDefaultState();
  };

  return {
    state,
    dsl,
    reset,
  };
};
