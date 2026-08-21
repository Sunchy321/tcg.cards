<template>
  <div class="portal-shell mx-auto max-w-6xl px-5 py-14 sm:px-8 lg:py-20">
    <section class="max-w-3xl">
      <h1 class="text-4xl font-semibold tracking-[-0.035em] text-highlighted sm:text-6xl">{{ $t('portal.title') }}</h1>
      <p class="mt-6 max-w-2xl text-lg leading-8 text-muted">{{ $t('portal.description') }}</p>
    </section>

    <section class="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      <NuxtLink v-for="game in games" :key="game.id" :to="`/v1/${game.id}`" class="group rounded-md border border-default bg-default p-5 transition-colors hover:border-accented hover:bg-muted/40">
        <div class="flex items-start justify-between gap-4">
          <div class="grid size-12 place-items-center rounded-md border border-default bg-muted/50 text-primary">
            <UIcon :name="`i:${game.id}-logo`" class="size-8" />
          </div>
          <UIcon name="i-lucide-arrow-up-right" class="size-4 text-dimmed transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
        </div>
        <h2 class="mt-5 text-base font-semibold text-highlighted">{{ game.name }}</h2>
      </NuxtLink>
    </section>
  </div>
</template>

<script setup lang="ts">
import { listGames } from '../../../lib/registry-docs';

const games = listGames();
</script>
