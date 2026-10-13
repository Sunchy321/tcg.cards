<template>
  <DocsShell :game="game">
    <article class="docs-article max-w-5xl">
      <header id="overview" class="border-b border-default pb-10">
        <p class="mb-4 text-sm font-medium text-primary">{{ $t('reference.resources') }}</p>
        <h1 class="text-4xl font-semibold tracking-[-0.035em] text-highlighted sm:text-5xl">{{ $t(resourceKey(game, 'catalog')) }}</h1>
      </header>

      <section v-for="catalog in catalogs" :id="catalog.name" :key="catalog.name" class="scroll-mt-24 border-b border-default py-8 last:border-0">
        <div class="mb-4 flex flex-wrap items-center gap-3">
          <UBadge color="primary" variant="solid" class="font-mono">{{ catalog.method }}</UBadge>
          <span class="text-sm text-muted">{{ catalog.tags.join(' / ') }}</span>
        </div>
        <h2 class="break-all font-mono text-2xl font-semibold tracking-[-0.025em] text-highlighted">{{ pathOf(catalog) }}</h2>
        <p class="mt-4 leading-6 text-muted">{{ $t(endpointDescKey(catalog)) }}</p>
        <div class="mt-6">
          <p class="mb-2 text-xs font-semibold tracking-[0.14em] text-primary uppercase">{{ $t('reference.output') }}</p>
          <SchemaViewer :node="catalog.output" :base-key="`${game}.fields.${catalog.resource}.${catalog.name}.out`" :game="game" />
        </div>
        <TryItPanel :endpoint="catalog" />
      </section>
    </article>
  </DocsShell>
</template>

<script setup lang="ts">
import type { EndpointDoc } from '../../../../lib/registry-docs';
import { groupGameEndpoints } from '../../../../lib/registry-docs';
import { endpointDescKey, resourceKey } from '../../../../lib/model-keys';

const { t } = useI18n();
const route = useRoute();
const params = computed(() => route.params as { game?: string });
const game = computed(() => String(params.value.game ?? ''));
const catalogs = computed(() => groupGameEndpoints(game.value).catalog ?? []);

useTitle(() => t(resourceKey(game.value, 'catalog')));

function pathOf(catalog: EndpointDoc): string {
  return `/v1/${catalog.path.join('/')}`;
}

if (catalogs.value.length === 0) {
  throw createError({ statusCode: 404, statusMessage: 'Catalog documentation not found' });
}
</script>
