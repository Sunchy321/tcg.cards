<template>
  <DocsShell :game="game">
    <article class="docs-article max-w-5xl">
    <header id="overview" class="border-b border-default pb-10">
      <p class="mb-4 text-sm font-medium text-primary">{{ $t('nav.intro') }}</p>
      <h1 class="text-4xl font-semibold tracking-[-0.035em] text-highlighted sm:text-5xl">{{ $t(`${game}.name`) }} API</h1>
      <p class="mt-5 max-w-3xl text-lg leading-8 text-muted">{{ $t(`${game}.description`) }}</p>
    </header>

    <section class="py-10">
      <h2 class="text-xl font-semibold text-highlighted">{{ $t('reference.resources') }}</h2>
      <div class="mt-6 grid gap-px border border-default bg-default sm:grid-cols-2">
        <NuxtLink v-for="card in resourceCards" :key="card.resource" :to="`/v1/${game}/${card.first.path.slice(1).join('/')}`" class="group bg-default p-5 hover:bg-muted/40">
          <div class="flex items-center justify-between">
            <h3 class="font-mono font-medium text-highlighted">{{ $t(resourceKey(game, card.resource)) }}</h3>
            <span class="text-xs text-muted">{{ $t('reference.endpoints', { n: card.count }) }}</span>
          </div>
          <p class="mt-3 text-sm leading-6 text-muted">{{ $t(endpointDescKey(card.first)) }}</p>
        </NuxtLink>
      </div>
    </section>
    </article>
  </DocsShell>
</template>

<script setup lang="ts">
import type { EndpointDoc } from '../../../../lib/registry-docs';
import { groupGameEndpoints, listGames } from '../../../../lib/registry-docs';
import { endpointDescKey, resourceKey } from '../../../../lib/model-keys';

const route = useRoute();
const params = computed(() => route.params as { game?: string });
const game = computed(() => String(params.value.game ?? ''));
const metadata = computed(() => listGames().find(item => item.id === game.value));
const groups = computed(() => groupGameEndpoints(game.value));
const resourceCards = computed(() => Object.entries(groups.value).map(([resource, endpoints]) => ({
  resource,
  first: endpoints[0] as EndpointDoc,
  count: endpoints.length,
})));

if (metadata.value == null) {
  throw createError({ statusCode: 404, statusMessage: 'Game documentation not found' });
}
</script>
