<template>
  <DocsShell v-if="endpoint" :game="game">
    <article class="docs-article max-w-none">
    <header id="overview" class="border-b border-default pb-9">
      <div class="mb-5 flex flex-wrap items-center gap-3">
        <UBadge color="primary" variant="solid" class="font-mono">{{ endpoint.method }}</UBadge>
        <span class="text-sm text-muted">{{ endpoint.tags.join(' / ') }}</span>
      </div>
      <h1 class="break-all font-mono text-3xl font-semibold tracking-[-0.025em] text-highlighted sm:text-4xl">{{ apiPath }}</h1>
      <p class="mt-5 max-w-4xl text-lg leading-8 text-muted">{{ $t(endpointDescKey(endpoint)) }}</p>
    </header>

    <section id="input" class="scroll-mt-24 py-10">
      <div class="mb-5 flex items-end justify-between gap-6">
        <div><p class="text-xs font-semibold tracking-[0.14em] text-primary uppercase">01</p><h2 class="mt-2 text-2xl font-semibold text-highlighted">{{ $t('reference.input') }}</h2></div>
        <code class="hidden text-xs text-muted sm:block">{{ endpoint.method }} {{ apiPath }}</code>
      </div>
      <SchemaViewer :node="endpoint.input" :base-key="inputBaseKey" :game="game" />
    </section>

    <section id="output" class="scroll-mt-24 border-t border-default py-10">
      <div class="mb-5"><p class="text-xs font-semibold tracking-[0.14em] text-primary uppercase">02</p><h2 class="mt-2 text-2xl font-semibold text-highlighted">{{ $t('reference.output') }}</h2></div>
      <SchemaViewer :node="endpoint.output" :base-key="outputBaseKey" :game="game" />
    </section>
    </article>
  </DocsShell>
</template>

<script setup lang="ts">
import { findEndpoint } from '../../../../lib/registry-docs';
import { endpointDescKey } from '../../../../lib/model-keys';

const route = useRoute();
const params = computed(() => route.params as { game?: string, slug?: string[] | string });
const game = computed(() => String(params.value.game ?? ''));
const slug = computed(() => Array.isArray(params.value.slug) ? params.value.slug.map(String) : [String(params.value.slug ?? '')]);
const endpoint = computed(() => findEndpoint(game.value, slug.value));

if (endpoint.value == null) {
  throw createError({ statusCode: 404, statusMessage: 'API endpoint not found' });
}

if (endpoint.value.resource === 'catalog') {
  await navigateTo(`/v1/${game.value}/catalog#${endpoint.value.name}`);
}

const apiPath = computed(() => `/v1/${endpoint.value?.path.join('/')}`);
const inputBaseKey = computed(() => endpoint.value ? `${game.value}.fields.${endpoint.value.resource}.${endpoint.value.name}.in` : '');
const outputBaseKey = computed(() => endpoint.value ? `${game.value}.fields.${endpoint.value.resource}.${endpoint.value.name}.out` : '');
</script>
