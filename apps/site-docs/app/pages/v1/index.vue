<template>
  <div class="portal-shell mx-auto max-w-6xl px-5 py-14 sm:px-8 lg:py-20">
    <section class="max-w-3xl">
      <div class="mb-6 flex items-center gap-3 text-sm font-medium text-primary">
        <span class="h-px w-10 bg-primary" />
        {{ $t('portal.eyebrow') }}
      </div>
      <h1 class="text-4xl font-semibold tracking-[-0.035em] text-highlighted sm:text-6xl">{{ $t('portal.title') }}</h1>
      <p class="mt-6 max-w-2xl text-lg leading-8 text-muted">{{ $t('portal.description') }}</p>
    </section>

    <section class="mt-14 grid gap-px overflow-hidden border border-default bg-default md:grid-cols-2">
      <NuxtLink v-for="game in games" :key="game.id" :to="`/v1/${game.id}`" class="group bg-default p-7 transition-colors hover:bg-muted/40 sm:p-9">
        <div class="flex items-start justify-between gap-6">
          <div class="grid size-12 place-items-center rounded-lg border border-default bg-muted/50 text-primary">
            <UIcon :name="game.icon" class="size-6" />
          </div>
          <UIcon name="i-lucide-arrow-up-right" class="size-5 text-dimmed transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
        </div>
        <h2 class="mt-8 text-2xl font-semibold tracking-tight text-highlighted">{{ game.name }}</h2>
        <p class="mt-3 leading-7 text-muted">{{ $t(`games.${game.id}.description`) }}</p>
        <div class="mt-6 flex flex-wrap gap-2">
          <UBadge v-for="resource in game.resources" :key="resource" color="neutral" variant="subtle">{{ resource }}</UBadge>
        </div>
      </NuxtLink>
    </section>

    <section class="mt-14 grid gap-8 border-t border-default pt-10 md:grid-cols-3">
      <div><p class="text-xs font-semibold tracking-widest text-primary uppercase">01</p><h3 class="mt-3 font-semibold text-highlighted">{{ $t('portal.contract_title') }}</h3><p class="mt-2 text-sm leading-6 text-muted">{{ $t('portal.contract_description') }}</p></div>
      <div><p class="text-xs font-semibold tracking-widest text-primary uppercase">02</p><h3 class="mt-3 font-semibold text-highlighted">{{ $t('portal.schema_title') }}</h3><p class="mt-2 text-sm leading-6 text-muted">{{ $t('portal.schema_description') }}</p></div>
      <div><p class="text-xs font-semibold tracking-widest text-primary uppercase">03</p><h3 class="mt-3 font-semibold text-highlighted">{{ $t('portal.version_title') }}</h3><p class="mt-2 text-sm leading-6 text-muted">{{ $t('portal.version_description') }}</p></div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { groupGameEndpoints, listGames } from '../../../lib/registry-docs';

const games = listGames().map(game => ({ ...game, resources: Object.keys(groupGameEndpoints(game.id)).slice(0, 4) }));
</script>
