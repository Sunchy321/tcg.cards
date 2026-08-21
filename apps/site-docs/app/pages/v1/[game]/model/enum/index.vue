<template>
  <DocsShell :game="game">
    <article class="docs-article max-w-5xl">
      <header id="overview" class="border-b border-default pb-10">
        <p class="mb-4 text-sm font-medium text-primary">{{ $t('nav.model') }}</p>
        <h1 class="text-4xl font-semibold tracking-[-0.035em] text-highlighted sm:text-5xl">{{ $t(`${game}.enums._self`) }}</h1>
      </header>

      <section class="mt-6 grid gap-px border border-default bg-default sm:grid-cols-2">
        <NuxtLink v-for="enumDoc in enums" :key="enumDoc.slug" :to="`/v1/${game}/model/enum/${enumDoc.slug}`" class="group bg-default p-5 hover:bg-muted/40">
          <h2 class="font-mono font-medium text-highlighted">{{ enumDoc.name }}</h2>
          <p class="mt-3 text-sm leading-6 text-muted">{{ $t(`${game}.enums.${enumDoc.slug}._self`) }}</p>
        </NuxtLink>
      </section>
    </article>
  </DocsShell>
</template>

<script setup lang="ts">
import { collectEnums } from '../../../../../../lib/registry-docs';

const route = useRoute();
const params = computed(() => route.params as { game?: string });
const game = computed(() => String(params.value.game ?? ''));
const enums = computed(() => collectEnums(game.value));

if (enums.value.length === 0) {
  throw createError({ statusCode: 404, statusMessage: 'Enum documentation not found' });
}
</script>
