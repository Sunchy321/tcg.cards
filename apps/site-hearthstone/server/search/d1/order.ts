import { asc, desc, sql } from 'drizzle-orm';
import type { SQL, SQLWrapper } from 'drizzle-orm';
import type { QueryRequest } from '#search/logical';

const fields = new Set(['name', 'id', 'set', 'cost', 'attack', 'health', 'stats', 'type', 'class']);

/** Carries scalar and precomputed ordering values from a filtered SQLite row. */
type OrderColumns = {
  nameOrder:     SQLWrapper;
  idOrder:       SQLWrapper;
  setOrder:      SQLWrapper;
  languageOrder: SQLWrapper;
  typeOrder:     SQLWrapper;
  classOrder:    SQLWrapper;
  type:          SQLWrapper;
  cost:          SQLWrapper;
  attack:        SQLWrapper;
  health:        SQLWrapper;
  durability:    SQLWrapper;
  armor:         SQLWrapper;
};

/** Validates every requested sort against the fields provided by the D1 projection. */
export function hasSupportedOrder(request: QueryRequest): boolean {
  return request.result.sort.every(sort => {
    const value
      = sort.kind === 'dsl' ? sort.command.value : sort.kind === 'request' ? sort.value : 'name+';
    return (
      typeof value === 'string'
      && value
        .toLowerCase()
        .split(',')
        .every(term => fields.has(term.replace(/[+-]$/, '')))
    );
  });
}

/** Mirrors PG component order, NULL placement, secondary names, and deterministic tail keys. */
export function compileOrder(request: QueryRequest, columns: OrderColumns): SQL[] {
  const source = request.result.sort[0];
  const value
    = source?.kind === 'dsl'
      ? source.command.value
      : source?.kind === 'request'
        ? source.value
        : 'name+';
  if (typeof value !== 'string') {
    throw new Error('Unsupported D1 ordering.');
  }
  const terms = value.toLowerCase().split(',');
  const result: SQL[] = [];
  for (const term of terms) {
    const field = term.replace(/[+-]$/, '');
    const descending = term.endsWith('-');
    const sort = descending ? desc : asc;
    /** Keeps PostgreSQL defaults for ordinary nullable numeric fields. */
    const numberOrder = (column: SQLWrapper): SQL =>
      descending ? sql`${column} DESC NULLS FIRST` : sql`${column} ASC NULLS LAST`;
    switch (field) {
    case 'name':
      result.push(sort(columns.nameOrder));
      break;
    case 'id':
      result.push(sort(columns.idOrder));
      break;
    case 'set':
      result.push(sort(columns.setOrder), asc(columns.nameOrder));
      break;
    case 'type':
      result.push(sort(columns.typeOrder), asc(columns.nameOrder));
      break;
    case 'class':
      result.push(sort(columns.classOrder), asc(columns.nameOrder));
      break;
    case 'cost':
      result.push(numberOrder(columns.cost), asc(columns.nameOrder));
      break;
    case 'attack':
      result.push(numberOrder(columns.attack), asc(columns.nameOrder));
      break;
    case 'health':
      result.push(numberOrder(columns.health), asc(columns.nameOrder));
      break;
    case 'stats': {
      const sum = sql`CASE WHEN ${columns.type} = 'hero' THEN NULL ELSE
        (${columns.attack} + coalesce(${columns.health}, ${columns.durability}, ${columns.armor}, 0)) END`;
      result.push(descending ? sql`${sum} DESC NULLS LAST` : sql`${sum} ASC NULLS LAST`);
      result.push(
        descending
          ? sql`${columns.attack} DESC NULLS LAST`
          : sql`${columns.attack} ASC NULLS LAST`,
      );
      result.push(asc(columns.nameOrder));
      break;
    }
    default:
      throw new Error('Unsupported D1 sort field.');
    }
  }
  if (!terms.some(term => term.replace(/[+-]$/, '') === 'id')) {
    result.push(asc(columns.idOrder));
  }
  result.push(asc(columns.languageOrder));
  return result;
}
