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
  operator: '=',
});

const createDefaultState = (): AdvancedSearchState => ({
  keyword:      '',
  classes:      [],
  types:        [],
  races:        [],
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

export const useAdvancedSearch = () => {
  const state = ref<AdvancedSearchState>(createDefaultState());
  const searchInput = useSearchInput();

  const dsl = computed(() => buildAdvancedSearchDSL(state.value));

  watch(dsl, value => {
    searchInput.value = value;
  }, {
    immediate: true,
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
