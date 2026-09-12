<template>
  <div v-if="displayNode.kind === 'object'" class="schema-table overflow-x-auto border-y border-default">
    <table class="w-full min-w-3xl border-collapse text-sm">
      <thead>
        <tr class="border-b border-default bg-muted/60 text-left text-xs tracking-wide text-muted uppercase">
          <th class="w-1/4 px-4 py-3 font-semibold">{{ $t('schema.field') }}</th>
          <th class="w-1/4 px-4 py-3 font-semibold">{{ $t('schema.type') }}</th>
          <th class="px-4 py-3 font-semibold">{{ $t('schema.description') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :id="`field-${row.key}`" :key="`${row.depth}-${row.key}`" class="border-b border-muted last:border-0 align-top hover:bg-muted/30">
          <td class="px-4 py-3 font-mono font-medium text-highlighted">
            <span :style="{ paddingInlineStart: `${row.depth * 1.25}rem` }">{{ row.key }}</span>
          </td>
          <td class="px-4 py-3">
            <div class="flex flex-wrap items-center gap-1.5">
              <code class="text-primary">
                <NuxtLink v-if="enumLink(row.schema)" :to="enumLink(row.schema)">{{ typeText(row.schema) }}</NuxtLink>
                <span v-else>{{ typeText(row.schema) }}</span>
              </code>
              <UBadge v-if="row.schema.optional" color="neutral" variant="subtle" size="sm">{{ $t('schema.optional') }}</UBadge>
              <UBadge v-else color="primary" variant="subtle" size="sm">{{ $t('schema.required') }}</UBadge>
            </div>
            <div v-if="row.schema.defaultValue !== undefined" class="mt-1 text-xs text-muted">
              {{ $t('schema.default') }}: <code>{{ JSON.stringify(row.schema.defaultValue) }}</code>
            </div>
            <div v-for="constraint in row.schema.constraints" :key="constraint" class="mt-1 text-xs text-muted">{{ constraint }}</div>
          </td>
          <td class="px-4 py-3 leading-6 text-muted">
            <p v-if="$te(descriptionKey(row))">{{ $t(descriptionKey(row)) }}</p>
            <div v-if="row.schema.kind === 'enum'" class="flex flex-wrap gap-1.5">
              <code v-for="value in row.schema.values" :key="value" class="rounded bg-muted px-1.5 py-0.5 text-xs text-highlighted">{{ value }}</code>
            </div>
            <span v-else-if="!$te(descriptionKey(row))" class="text-dimmed">{{ $t('schema.description_pending') }}</span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>

  <div v-else class="border-y border-default bg-muted/30 px-4 py-4 font-mono text-sm">
    <span class="text-primary">
      <NuxtLink v-if="enumLink(node)" :to="enumLink(node)">{{ typeText(node) }}</NuxtLink>
      <span v-else>{{ typeText(node) }}</span>
    </span>
    <span v-if="node.kind === 'enum'"> = {{ node.values?.join(' | ') }}</span>
    <span v-if="node.kind === 'literal'"> = {{ JSON.stringify(node.value) }}</span>
  </div>
</template>

<script setup lang="ts">
import type { SchemaNode } from '../../lib/introspect';
import { kebab } from '../../lib/registry-docs';

type Row = {
  key:    string;
  path:   string;
  depth:  number;
  schema: SchemaNode;
};

const props = defineProps<{
  node:    SchemaNode;
  baseKey: string;
  game:    string;
}>();

/** Resolves array-of-object schemas to their item so nested fields render as a table. */
const displayNode = computed(() => {
  const node = props.node;
  return node.kind === 'array' && node.item?.kind === 'object' ? node.item : node;
});

/** Flattens nested objects into the continuous tree table used throughout the docs. */
function flatten(node: SchemaNode, depth = 0, prefix = ''): Row[] {
  return (node.fields ?? []).flatMap(field => {
    const path = prefix ? `${prefix}.${field.key}` : field.key;
    const row = { key: field.key, path, depth, schema: field.schema };
    const nested = field.schema.kind === 'object'
      ? flatten(field.schema, depth + 1, path)
      : field.schema.kind === 'array' && field.schema.item?.kind === 'object'
        ? flatten(field.schema.item, depth + 1, path)
        : [];
    return [row, ...nested];
  });
}

/** Produces the compact type label shown in each schema row. */
function typeLabel(node: SchemaNode): string {
  if (node.kind === 'array') {
    return `${typeLabel(node.item ?? { kind: 'unknown' })}[]`;
  }
  if (node.kind === 'record') {
    return `Record<string, ${typeLabel(node.valueSchema ?? { kind: 'unknown' })}>`;
  }
  if (node.kind === 'union') {
    return (node.options ?? []).map(typeLabel).join(' | ');
  }
  if (node.kind === 'enum') {
    return node.name ?? 'enum';
  }
  return node.kind;
}

/** Produces the type label with a `?` suffix for nullable fields. */
function typeText(node: SchemaNode): string {
  return `${typeLabel(node)}${node.nullable ? '?' : ''}`;
}

/** Returns the enum detail page link for an enum type label (descending arrays). */
function enumLink(schema: SchemaNode): string | undefined {
  let node: SchemaNode | undefined = schema;
  while (node?.kind === 'array') {
    node = node.item;
  }
  if (node?.kind !== 'enum' || !node.name) {
    return undefined;
  }
  return `/v1/${props.game}/model/enum/${kebab(node.name)}`;
}

const rows = computed(() => flatten(displayNode.value));

/** True for object (or array-of-object) fields that group nested rows. */
function isContainer(schema: SchemaNode): boolean {
  return schema.kind === 'object' || (schema.kind === 'array' && schema.item?.kind === 'object');
}

/** Builds the localized-description i18n key for one schema row. Containers use a `_self` leaf. */
function descriptionKey(row: Row): string {
  const path = isContainer(row.schema) ? `${row.path}._self` : row.path;
  return `${props.baseKey}.${path}`;
}
</script>
