import { and, not, or, sql } from 'drizzle-orm';
import type { SQL, SQLWrapper } from 'drizzle-orm';
import { planCoverage } from '#search/logical';
import type { CapabilityGap, CoveragePlan, DatasetDescriptor, QueryRequest, ResolvedCommand } from '#search/logical';
import { analyzeRegex } from '#search/regex';
import type { TextCondition } from '#search/regex';

/** Plans regex facts together with the existing boolean safety and backend capability rules. */
export function planRegexCoverage(
  request: QueryRequest,
  dataset: DatasetDescriptor,
  gap: (request: QueryRequest) => CapabilityGap | null,
  fields: readonly string[],
): CoveragePlan {
  const resultGap = gap({ ...request, filter: null });
  if (resultGap != null) {
    return { type: 'original', reason: [resultGap] };
  }
  return planCoverage(request, dataset, command => {
    let rewritten = command;
    let exact = true;
    if (typeof command.value !== 'string') {
      const analysis = analyzeRegex(command.value.source);
      if (!fields.includes(command.commandId) || analysis.type === 'original') {
        return undefined;
      }
      exact = analysis.type === 'exact' && (command.operator === ':' || command.operator === '');
      if (!exact && command.qualifier.includes('!')) {
        return undefined;
      }
      rewritten = withCondition(command, analysis.condition);
    }
    const leafRequest = { ...request, filter: { kind: 'leaf' as const, command: rewritten } };
    const baseline = planCoverage(leafRequest, dataset);
    const limitation = baseline.type === 'exact' ? gap(leafRequest) : null;
    if (baseline.type !== 'exact' || limitation != null) {
      return limitation == null ? undefined : { candidate: null, exact: false, gaps: [limitation] };
    }
    return {
      candidate: leafRequest.filter,
      exact,
      gaps:      exact ? [] : [{ kind: 'regex', field: command.commandId, detail: 'Necessary substrings require original PostgreSQL verification.' }],
    };
  });
}

/** Compiles facts against a single field so conjunctions cannot borrow different source witnesses. */
export function compileTextCondition(condition: TextCondition, column: SQLWrapper): SQL {
  if (condition.kind === 'contains') {
    const escaped = condition.value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
    return sql`${column} LIKE ${`%${escaped}%`} ESCAPE '\\'`;
  }
  const parts = condition.exprs.map(child => compileTextCondition(child, column));
  return (condition.kind === 'and' ? and(...parts) : or(...parts))!;
}

/** Applies a regex fact to each source before the handler's source-level boolean composition. */
export function compileRegexCondition(command: ResolvedCommand, columns: SQLWrapper[]): SQL {
  if (command.textCondition == null) {
    throw new Error('Regex facts must be planned before SQLite compilation.');
  }
  const matches = columns.map(column => compileTextCondition(command.textCondition!, column));
  return command.qualifier.includes('!') ? and(...matches.map(not))! : or(...matches)!;
}

/** Detects source values outside the proven ASCII case-folding subset without losing NULLs. */
export function nonAscii(column: SQLWrapper): SQL {
  return sql`${column} GLOB ${'*[^\x01-\x7f]*'}`;
}

/** Restricts a PG search to all candidate cards with one bound parameter, including an empty set. */
export function candidateCards(column: SQLWrapper, cardIds: string[] | undefined): SQL | undefined {
  return cardIds == null ? undefined : sql`${column}::text IN (SELECT jsonb_array_elements_text(${JSON.stringify(cardIds)}::jsonb))`;
}

/** Replaces regex leaves with their proven per-source facts after coverage has been established. */
export function regexRequest(request: QueryRequest): QueryRequest {
  /** Rewrites filter nodes without changing their boolean structure or result controls. */
  const rewrite = (query: NonNullable<QueryRequest['filter']>): NonNullable<QueryRequest['filter']> => {
    if (query.kind === 'not') {
      return { ...query, expr: rewrite(query.expr) };
    }
    if (query.kind !== 'leaf') {
      return { ...query, exprs: query.exprs.map(rewrite) };
    }
    if (typeof query.command.value === 'string') {
      return query;
    }
    const analysis = analyzeRegex(query.command.value.source);
    if (analysis.type === 'original') {
      return query;
    }
    return { kind: 'leaf', command: withCondition(query.command, analysis.condition) };
  };
  return { ...request, filter: request.filter == null ? null : rewrite(request.filter) };
}

/** Lists regex text commands whose original source columns require runtime ASCII evidence. */
export function regexCommands(query: QueryRequest['filter'], allText = false): ResolvedCommand[] {
  if (query == null) {
    return [];
  }
  if (query.kind === 'not') {
    return regexCommands(query.expr, allText);
  }
  if (query.kind !== 'leaf') {
    return query.exprs.flatMap(child => regexCommands(child, allText));
  }
  return (allText && ['raw', 'name', 'text', 'oracle', 'set'].includes(query.command.commandId))
    || typeof query.command.value !== 'string' || query.command.textCondition != null
    ? [query.command]
    : [];
}

/** Marks a proven text expression for existing capability checks and the per-source compiler. */
function withCondition(command: ResolvedCommand, textCondition: TextCondition): ResolvedCommand {
  // The nonempty placeholder passes legacy value checks; it must never be evaluated as a literal.
  // Every supported D1 text compiler dispatches textCondition before ordinary value handling.
  return { ...command, value: 'regex', argType: 'string', textCondition };
}
