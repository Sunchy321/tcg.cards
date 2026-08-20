import type { SchemaNode } from './introspect';

export type EnumKey = {
  game:  string;
  name:  string;
  values: string[];
};

export type FieldKey = {
  game:  string;
  schema: string;
  field: string;
};

/** Collect the expected i18n keys (`{game}.model.*`) implied by the given schemas. */
export function collectModelKeys(game: string, nodes: SchemaNode[]): {
  enums:  EnumKey[];
  fields: FieldKey[];
} {
  const enums: EnumKey[] = [];
  const fields: FieldKey[] = [];
  const seenEnums = new Set<string>();

  for (const node of nodes) {
    walk(node, '');
  }

  return { enums, fields };

  function walk(node: SchemaNode, schemaName: string) {
    switch (node.kind) {
    case 'object':
      for (const field of node.fields) {
        if (schemaName) {
          fields.push({ game, schema: schemaName, field: field.key });
        }
        walk(field.schema, schemaName);
      }
      break;
    case 'enum': {
      const name = schemaName || 'enum';
      if (!seenEnums.has(name)) {
        seenEnums.add(name);
        enums.push({ game, name, values: node.values });
      }
      break;
    }
    case 'array':
      walk(node.item, schemaName);
      break;
    case 'union':
      for (const opt of node.options) {
        walk(opt, schemaName);
      }
      break;
    case 'record':
      walk(node.value, schemaName);
      break;
    default:
      break;
    }
  }
}
