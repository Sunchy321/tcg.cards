import type { SchemaNode } from './introspect';
import { collectEndpoints, collectEnums } from './registry-docs';
import { endpointDescKey } from './model-keys';

export type SearchItem = {
  game:           string;
  label:          string;
  descriptionKey: string;
  to:             string;
  suffix:         string;
};

export type SearchIndex = {
  endpoints: SearchItem[];
  fields:    SearchItem[];
  enums:     SearchItem[];
};

/** True for object (or array-of-object) fields that group nested rows. */
function isContainer(schema: SchemaNode): boolean {
  return schema.kind === 'object' || (schema.kind === 'array' && schema.item?.kind === 'object');
}

/** Collects every rendered field path and whether it is a container (needs a `_self` description key). */
function collectFieldDocs(node: SchemaNode | undefined): Array<{ path: string, isContainer: boolean }> {
  const docs: Array<{ path: string, isContainer: boolean }> = [];

  let root = node;
  if (root?.kind === 'array' && root.item?.kind === 'object') {
    root = root.item;
  }

  walk(root, '');
  return docs;

  function walk(current: SchemaNode | undefined, prefix: string): void {
    if (current?.kind !== 'object') {
      return;
    }
    for (const field of current.fields ?? []) {
      const path = prefix ? `${prefix}.${field.key}` : field.key;
      const container = isContainer(field.schema);
      docs.push({ path, isContainer: container });
      if (container) {
        walk(field.schema.kind === 'array' ? field.schema.item : field.schema, path);
      }
    }
  }
}

/** Builds the searchable endpoint/field/enum items, each carrying its localized-description i18n key. */
export function buildSearchIndex(): SearchIndex {
  const endpoints: SearchItem[] = [];
  const fields: SearchItem[] = [];
  const enums: SearchItem[] = [];

  for (const endpoint of collectEndpoints()) {
    const to = `/v1/${endpoint.path.join('/')}`;
    endpoints.push({
      game:           endpoint.game,
      label:          to,
      descriptionKey: endpointDescKey(endpoint),
      to,
      suffix:         endpoint.game,
    });

    for (const kind of ['in', 'out'] as const) {
      const node = kind === 'in' ? endpoint.input : endpoint.output;
      const base = `fields.${endpoint.game}.${endpoint.resource}.${endpoint.name}.${kind}`;
      for (const doc of collectFieldDocs(node)) {
        fields.push({
          game:           endpoint.game,
          label:          doc.path,
          descriptionKey: `${base}.${doc.path}${doc.isContainer ? '._self' : ''}`,
          to,
          suffix:         `${endpoint.game} ${endpoint.resource} ${endpoint.name}`,
        });
      }
    }
  }

  for (const game of ['magic', 'hearthstone'] as const) {
    for (const enumDoc of collectEnums(game)) {
      const to = `/v1/${game}/model/enum/${enumDoc.slug}`;
      enums.push({
        game:           game,
        label:          enumDoc.name,
        descriptionKey: `${game}.enums.${enumDoc.slug}._self`,
        to,
        suffix:         game,
      });
      for (const value of enumDoc.values) {
        enums.push({
          game:           game,
          label:          value,
          descriptionKey: `${game}.enums.${enumDoc.slug}.${value}`,
          to,
          suffix:         enumDoc.name,
        });
      }
    }
  }

  return { endpoints, fields, enums };
}
