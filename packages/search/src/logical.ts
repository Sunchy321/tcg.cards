import type {
  CommandArgType,
  LogicalCommandDescriptor,
  LogicalWitness,
  Operator,
  Qualifier,
} from './command/types';

/** Preserves regular expressions as data that can cross adapter boundaries. */
export type LogicalValue = string | { kind: 'regex', source: string, flags: string };

/** Carries a resolved command without storing SQL or a database column. */
export type ResolvedCommand = {
  commandId:  string;
  action:     'query' | 'order-by';
  descriptor: LogicalCommandDescriptor;
  operator:   Operator;
  qualifier:  Qualifier[];
  value:      LogicalValue;
  argType?:   CommandArgType;
  modifier?:  string;
  pattern?:   Record<string, string>;
  topLevel:   boolean;
};

/** Represents the logical boolean structure used by every search adapter. */
export type LogicalQuery
  = | { kind: 'leaf', command: ResolvedCommand }
    | { kind: 'not', expr: LogicalQuery }
    | { kind: 'and' | 'or', exprs: LogicalQuery[] };

/** Describes a sort source without embedding adapter-specific sort values. */
export type SortSpec
  = | { kind: 'dsl', command: ResolvedCommand }
    | { kind: 'request', field: 'order', value: string }
    | { kind: 'action-default' };

/** Captures result-shaping inputs that are separate from the filter tree. */
export type QueryResultRequest = {
  sort:     SortSpec[];
  group:    string | null;
  page:     number | null;
  pageSize: number | null;
  total:    boolean;
  ambit:    string | null;
  lang:     string | null;
};

/** Bundles a resolved filter with pagination, language, grouping, and scope inputs. */
export type QueryRequest = {
  filter: LogicalQuery | null;
  result: QueryResultRequest;
};

/** Lists command and result features that a target can execute exactly. */
export type DatasetDescriptor = {
  commands: LogicalCommandDescriptor[];
  result: {
    sort:  boolean;
    group: boolean;
    page:  boolean;
    total: boolean;
    ambit: boolean;
    lang:  boolean;
  };
};

/** Explains one command or result feature that a target cannot preserve. */
export type CapabilityGap = {
  kind:   'field' | 'operator' | 'qualifier' | 'regex' | 'value-class' | 'null-semantics' | 'text-semantics' | 'collection-semantics' | 'witness' | 'modifier' | 'pattern' | 'expansion' | 'result';
  field:  string;
  detail: string;
};

/** Reports whether a request is exact, safely reducible to candidates, or unsupported. */
export type CoveragePlan
  = | { type: 'exact' }
    | { type: 'candidate', candidate: LogicalQuery, residual: LogicalQuery, uncovered: CapabilityGap[] }
    | { type: 'original', reason: CapabilityGap[] };

/** Defines static planning and execution for a database-independent request. */
export interface SearchAdapter<Result = unknown, Options = unknown> {
  descriptor(): DatasetDescriptor;
  plan(request: QueryRequest): CoveragePlan;
  execute(request: QueryRequest, options: Options): Promise<Result>;
}

/** Carries the safe candidate and uncovered features for one filter subtree. */
type NodePlan = {
  candidate: LogicalQuery | null;
  exact:     boolean;
  gaps:      CapabilityGap[];
};

/** Plans coverage without making a database call or changing query meaning. */
export function planCoverage(request: QueryRequest, dataset: DatasetDescriptor): CoveragePlan {
  const filterPlan = request.filter == null
    ? { candidate: null, exact: true, gaps: [] } satisfies NodePlan
    : planNode(request.filter, dataset.commands);
  const resultGaps = describeResultGaps(request.result, dataset.result);
  const gaps = uniqueGaps([...filterPlan.gaps, ...resultGaps]);

  if (resultGaps.length > 0) {
    return { type: 'original', reason: gaps };
  }

  if (filterPlan.exact) {
    return { type: 'exact' };
  }

  if (request.filter != null && filterPlan.candidate != null) {
    return {
      type:      'candidate',
      candidate: filterPlan.candidate,
      residual:  request.filter,
      uncovered: gaps,
    };
  }

  return { type: 'original', reason: gaps };
}

/** Finds a safe candidate expression for one boolean query node. */
function planNode(query: LogicalQuery, supported: LogicalCommandDescriptor[]): NodePlan {
  switch (query.kind) {
  case 'leaf': {
    const gaps = describeCommandGaps(query.command, supported);

    return {
      candidate: gaps.length === 0 ? query : null,
      exact:     gaps.length === 0,
      gaps,
    };
  }
  case 'not': {
    const child = planNode(query.expr, supported);

    return child.exact && child.candidate != null
      ? { candidate: { kind: 'not', expr: child.candidate }, exact: true, gaps: child.gaps }
      : { candidate: null, exact: false, gaps: child.gaps };
  }
  case 'and': {
    const children = query.exprs.map(expr => planNode(expr, supported));
    const candidates = children.flatMap(child => child.candidate == null ? [] : [child.candidate]);
    const candidate = combine('and', candidates);

    return {
      candidate,
      exact: children.every(child => child.exact),
      gaps:  children.flatMap(child => child.gaps),
    };
  }
  case 'or': {
    const children = query.exprs.map(expr => planNode(expr, supported));

    if (children.some(child => child.candidate == null)) {
      return {
        candidate: null,
        exact:     false,
        gaps:      children.flatMap(child => child.gaps),
      };
    }

    return {
      candidate: combine('or', children.flatMap(child => child.candidate == null ? [] : [child.candidate])),
      exact:     children.every(child => child.exact),
      gaps:      children.flatMap(child => child.gaps),
    };
  }
  }
}

/** Builds one boolean node and removes redundant single-child wrappers. */
function combine(kind: 'and' | 'or', exprs: LogicalQuery[]): LogicalQuery | null {
  if (exprs.length === 0) {
    return null;
  }

  if (exprs.length === 1) {
    return exprs[0]!;
  }

  return { kind, exprs };
}

/** Lists semantic differences between a resolved command and a target command. */
function describeCommandGaps(command: ResolvedCommand, supported: LogicalCommandDescriptor[]): CapabilityGap[] {
  const wanted = command.descriptor;
  const target = supported.find(value => value.field === wanted.field);

  if (target == null) {
    return [{ kind: 'field', field: wanted.field, detail: 'Field is not available.' }];
  }

  const gaps: CapabilityGap[] = [];

  if (!target.operators.includes(command.operator)) {
    gaps.push({ kind: 'operator', field: wanted.field, detail: `Operator ${command.operator || '(bare)'} is unsupported.` });
  }

  for (const qualifier of command.qualifier) {
    if (!target.qualifiers.includes(qualifier)) {
      gaps.push({ kind: 'qualifier', field: wanted.field, detail: `Qualifier ${qualifier} is unsupported.` });
    }
  }

  if (typeof command.value !== 'string' && !target.allowsRegex) {
    gaps.push({ kind: 'regex', field: wanted.field, detail: 'Regular expressions are unsupported.' });
  }

  if (command.modifier != null && !target.modifiers.includes(command.modifier)) {
    gaps.push({ kind: 'modifier', field: wanted.field, detail: `Modifier ${command.modifier} is unsupported.` });
  }

  if (command.pattern != null && target.pattern !== wanted.pattern) {
    gaps.push({ kind: 'pattern', field: wanted.field, detail: 'The matched command pattern is unsupported.' });
  }

  if (wanted.valueClass !== target.valueClass) {
    gaps.push({ kind: 'value-class', field: wanted.field, detail: 'The target uses a different value class.' });
  }

  if (wanted.nullSemantics !== target.nullSemantics) {
    gaps.push({ kind: 'null-semantics', field: wanted.field, detail: 'The target uses different NULL semantics.' });
  }

  if (wanted.textSemantics !== target.textSemantics) {
    gaps.push({ kind: 'text-semantics', field: wanted.field, detail: 'The target uses different text semantics.' });
  }

  if (wanted.collectionSemantics !== target.collectionSemantics) {
    gaps.push({ kind: 'collection-semantics', field: wanted.field, detail: 'The target uses different collection semantics.' });
  }

  for (const witness of wanted.witness) {
    if (!target.witness.includes(witness as LogicalWitness)) {
      gaps.push({ kind: 'witness', field: wanted.field, detail: `The target cannot preserve ${witness} witnesses.` });
    }
  }

  if (wanted.expansion.length !== target.expansion.length || wanted.expansion.some((field, index) => field !== target.expansion[index])) {
    gaps.push({ kind: 'expansion', field: wanted.field, detail: 'The target expands this command differently.' });
  }

  return gaps;
}

/** Lists requested result operations the target cannot preserve. */
function describeResultGaps(
  result: QueryResultRequest,
  supported: DatasetDescriptor['result'],
): CapabilityGap[] {
  const gaps: CapabilityGap[] = [];

  if (result.sort.length > 0 && !supported.sort) {
    gaps.push({ kind: 'result', field: 'sort', detail: 'Sorting is unsupported.' });
  }

  if (result.group != null && !supported.group) {
    gaps.push({ kind: 'result', field: 'group', detail: 'Grouping is unsupported.' });
  }

  if ((result.page != null || result.pageSize != null) && !supported.page) {
    gaps.push({ kind: 'result', field: 'page', detail: 'Pagination is unsupported.' });
  }

  if (result.total && !supported.total) {
    gaps.push({ kind: 'result', field: 'total', detail: 'Total counts are unsupported.' });
  }

  if (result.ambit != null && !supported.ambit) {
    gaps.push({ kind: 'result', field: 'ambit', detail: 'Ambit selection is unsupported.' });
  }

  if (result.lang != null && !supported.lang) {
    gaps.push({ kind: 'result', field: 'lang', detail: 'Language selection is unsupported.' });
  }

  return gaps;
}

/** Removes duplicate planner reasons while retaining first-seen order. */
function uniqueGaps(gaps: CapabilityGap[]): CapabilityGap[] {
  const seen = new Set<string>();

  return gaps.filter(gap => {
    const key = `${gap.kind}:${gap.field}:${gap.detail}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}
