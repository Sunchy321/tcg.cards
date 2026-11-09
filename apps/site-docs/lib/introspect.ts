type AnySchema = unknown;

export type SchemaNode = {
  kind:          string;
  description?:  string;
  name?:         string;
  optional?:     boolean;
  nullable?:     boolean;
  defaultValue?: unknown;
  constraints?:  string[];
  values?:       string[];
  value?:        string | number | boolean | null;
  item?:         SchemaNode;
  fields?:       Array<{ key: string, schema: SchemaNode }>;
  options?:      SchemaNode[];
  valueSchema?:  SchemaNode;
};

type ZodDef = {
  type?:         string;
  shape?:        Record<string, AnySchema> | (() => Record<string, AnySchema>);
  entries?:      Record<string, string>;
  values?:       readonly unknown[];
  value?:        unknown;
  innerType?:    AnySchema;
  element?:      AnySchema;
  valueType?:    AnySchema;
  options?:      AnySchema[];
  checks?:       unknown[];
  defaultValue?: unknown | (() => unknown);
};

/** Converts one Zod schema into the normalized tree consumed by documentation views. */
export function describeSchema(schema: AnySchema | undefined): SchemaNode {
  if (schema == null) {
    return { kind: 'unknown' };
  }

  const def = getDef(schema);
  const description = (schema as unknown as { description?: string }).description;
  const base = { description };

  switch (def.type) {
  case 'optional':
    return { ...describeSchema(def.innerType), optional: true };
  case 'nullable':
    return { ...describeSchema(def.innerType), nullable: true };
  case 'default':
    return {
      ...describeSchema(def.innerType),
      optional:     true,
      defaultValue: typeof def.defaultValue === 'function' ? def.defaultValue() : def.defaultValue,
    };
  case 'object': {
    const shape = typeof def.shape === 'function' ? def.shape() : def.shape ?? {};
    return {
      ...base,
      kind:   'object',
      fields: Object.entries(shape).map(([key, value]) => ({ key, schema: describeSchema(value) })),
    };
  }
  case 'array':
    return { ...base, kind: 'array', item: describeSchema(def.element) };
  case 'record':
    return { ...base, kind: 'record', valueSchema: describeSchema(def.valueType) };
  case 'union':
  case 'discriminatedUnion':
    return { ...base, kind: 'union', options: (def.options ?? []).map(describeSchema) };
  case 'enum':
    return {
      ...base,
      kind:   'enum',
      name:   description,
      values: Object.values(def.entries ?? {}).map(String),
    };
  case 'literal': {
    const value = def.values?.[0] ?? def.value;
    return { ...base, kind: 'literal', value: value as SchemaNode['value'] };
  }
  case 'string':
  case 'number':
  case 'boolean':
  case 'bigint':
  case 'date':
    return { ...base, kind: def.type, constraints: describeChecks(def.checks) };
  case 'null':
    return { ...base, kind: 'null', value: null };
  case 'any':
  case 'unknown':
  case 'transform':
  case 'pipe':
    return { ...base, kind: 'unknown' };
  default:
    return { ...base, kind: def.type ?? 'unknown' };
  }
}

/** Reads the version-independent Zod definition object. */
function getDef(schema: AnySchema): ZodDef {
  return (schema as unknown as { _def?: ZodDef, def?: ZodDef })._def
    ?? (schema as unknown as { def?: ZodDef }).def
    ?? {};
}

/** Formats serializable Zod checks without coupling the UI to Zod internals. */
function describeChecks(checks: unknown[] | undefined): string[] {
  return (checks ?? []).flatMap(check => {
    const value = check as { _zod?: { def?: Record<string, unknown> }, def?: Record<string, unknown> };
    const details = value._zod?.def ?? value.def;
    if (details == null) {
      return [];
    }

    return [Object.entries(details)
      .filter(([key]) => key !== 'check' && key !== 'error')
      .map(([key, entry]) => `${key}: ${String(entry)}`)
      .join(', ')]
      .filter(Boolean);
  });
}
