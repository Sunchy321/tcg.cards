<template>
  <div class="docs-grid relative left-1/2 min-h-[calc(100dvh-var(--ui-header-height))] w-screen -translate-x-1/2">
    <aside class="docs-sidebar sticky top-15 hidden h-[calc(100dvh-3.75rem)] overflow-y-auto border-r border-default bg-muted/25 px-4 py-7 lg:block">
      <nav aria-label="API navigation" class="space-y-7">
        <NuxtLink :to="`/v1/${game}`" class="docs-nav-link" exact-active-class="is-active">
          {{ $t('nav.intro') }}
        </NuxtLink>

        <section v-for="(endpoints, resource) in groups" :key="resource" class="space-y-2">
          <h2 class="px-2 text-xs font-semibold tracking-[0.14em] text-muted uppercase">{{ title(resource) }}</h2>
          <div class="space-y-0.5">
            <NuxtLink v-for="endpoint in endpoints" :key="endpoint.path.join('/')" :to="`/v1/${game}/${endpoint.path.slice(1).join('/')}`" class="docs-nav-link" active-class="is-active">
              {{ endpoint.name === '' ? title(resource) : title(endpoint.name) }}
            </NuxtLink>
          </div>
        </section>

        <section class="space-y-2">
          <h2 class="px-2 text-xs font-semibold tracking-[0.14em] text-muted uppercase">{{ $t('nav.model') }}</h2>
          <NuxtLink v-for="resource in Object.keys(groups)" :key="resource" :to="`/v1/${game}/models/${resource}`" class="docs-nav-link" active-class="is-active">
            {{ title(resource) }}
          </NuxtLink>
        </section>
      </nav>
    </aside>

    <div class="min-w-0 px-5 py-10 sm:px-8 lg:px-10 xl:px-14">
      <slot />
    </div>

    <aside class="sticky top-15 hidden h-[calc(100dvh-3.75rem)] overflow-y-auto border-l border-default px-5 py-8 2xl:block">
      <p class="mb-4 text-xs font-semibold tracking-[0.14em] text-muted uppercase">{{ $t('nav.on_this_page') }}</p>
      <nav class="space-y-2 text-sm text-muted">
        <a href="#overview" class="block hover:text-primary">{{ $t('nav.overview') }}</a>
        <a href="#input" class="block hover:text-primary">{{ $t('reference.input') }}</a>
        <a href="#output" class="block hover:text-primary">{{ $t('reference.output') }}</a>
      </nav>
    </aside>
  </div>
</template>

<script setup lang="ts">
import { groupGameEndpoints } from '../../lib/registry-docs';

const props = defineProps<{ game: string }>();
const groups = computed(() => groupGameEndpoints(props.game));

/** Formats registry identifiers for navigation labels. */
function title(value: string): string {
  return value.split('-').map(part => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(' ');
}
</script>
