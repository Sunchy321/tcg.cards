import type { SchemaNode } from './introspect';
import type { EndpointDoc } from './registry-docs';

/** Computes the i18n key for one endpoint's description. */
export function endpointDescKey(endpoint: Pick<EndpointDoc, 'game' | 'resource' | 'name'>): string {
  return `${endpoint.game}.endpoints.${endpoint.resource}.${endpoint.name}`;
}

/** Computes the i18n key for one resource's display label (nested under the endpoint-label container). */
export function resourceKey(game: string, resource: string): string {
  return `${game}.resources.${resource}._self`;
}

/** Computes the i18n key for one endpoint's display label. */
export function endpointLabelKey(game: string, resource: string, name: string): string {
  return `${game}.resources.${resource}.${name}`;
}

/** Collects the full dotted paths of every field rendered by SchemaViewer. */
export function collectFieldPaths(node: SchemaNode | undefined): string[] {
  const paths: string[] = [];

  let root = node;
  if (root?.kind === 'array' && root.item?.kind === 'object') {
    root = root.item;
  }

  walk(root, '');
  return paths;

  function walk(current: SchemaNode | undefined, prefix: string): void {
    if (current?.kind !== 'object') {
      return;
    }
    for (const field of current.fields ?? []) {
      const path = prefix ? `${prefix}.${field.key}` : field.key;
      paths.push(path);
      if (field.schema.kind === 'object') {
        walk(field.schema, path);
      } else if (field.schema.kind === 'array' && field.schema.item?.kind === 'object') {
        walk(field.schema.item, path);
      }
    }
  }
}

/** Computes the field-description i18n keys for one endpoint input or output schema. */
export function fieldKeys(endpoint: EndpointDoc, kind: 'in' | 'out'): string[] {
  const node = kind === 'in' ? endpoint.input : endpoint.output;
  const prefix = `${endpoint.game}.fields.${endpoint.resource}.${endpoint.name}.${kind}`;
  return collectFieldPaths(node).map(path => `${prefix}.${path}`);
}

/** Exports every i18n key the docs render for the given endpoints, for authoring and validation. */
export function collectAllKeys(endpoints: EndpointDoc[]): string[] {
  const keys: string[] = [];
  for (const endpoint of endpoints) {
    keys.push(endpointDescKey(endpoint));
    keys.push(resourceKey(endpoint.game, endpoint.resource));
    keys.push(endpointLabelKey(endpoint.game, endpoint.resource, endpoint.name));
    keys.push(...fieldKeys(endpoint, 'in'));
    keys.push(...fieldKeys(endpoint, 'out'));
  }
  return [...new Set(keys)].sort();
}
