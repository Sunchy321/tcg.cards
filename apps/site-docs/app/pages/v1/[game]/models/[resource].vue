<template>
  <DocsShell :game="game">
    <article class="docs-article max-w-none">
    <header id="overview" class="border-b border-default pb-9">
      <p class="mb-4 text-sm font-medium text-primary">{{ $t('nav.model') }}</p>
      <h1 class="text-4xl font-semibold tracking-[-0.035em] text-highlighted">{{ $t(resourceKey(game, resource)) }}</h1>
      <p class="mt-5 max-w-3xl text-lg leading-8 text-muted">{{ $t('model.description') }}</p>
    </header>

    <section v-for="schema in schemas" :key="schema.name" class="border-b border-default py-10 last:border-0">
      <h2 class="mb-5 font-mono text-xl font-semibold text-highlighted">{{ $t(endpointLabelKey(game, resource, schema.name)) }}</h2>
      <SchemaViewer :node="schema.node" :base-key="`${game}.fields.${resource}.${schema.name}.out`" :game="game" />
    </section>
    </article>
  </DocsShell>
</template>

<script setup lang="ts">
import { groupGameEndpoints } from '../../../../../lib/registry-docs';
import { endpointLabelKey, resourceKey } from '../../../../../lib/model-keys';

const route = useRoute();
const params = computed(() => route.params as { game?: string, resource?: string });
const game = computed(() => String(params.value.game ?? ''));
const resource = computed(() => String(params.value.resource ?? ''));
const endpoints = computed(() => groupGameEndpoints(game.value)[resource.value] ?? []);
const schemas = computed(() => endpoints.value.map(endpoint => ({ name: endpoint.name, node: endpoint.output })));

if (resource.value === 'catalog') {
  await navigateTo(`/v1/${game.value}/catalog`);
}

if (endpoints.value.length === 0) {
  throw createError({ statusCode: 404, statusMessage: 'Model documentation not found' });
}
</script>
