<template>
  <DocsShell v-if="enumDoc" :game="game">
    <article class="docs-article max-w-5xl">
      <header id="overview" class="border-b border-default pb-10">
        <p class="mb-4 text-sm font-medium text-primary">{{ $t(`${game}.enums._self`) }}</p>
        <h1 class="break-all font-mono text-4xl font-semibold tracking-[-0.035em] text-highlighted sm:text-5xl">{{ enumDoc.name }}</h1>
        <p class="mt-5 max-w-3xl text-lg leading-8 text-muted">{{ $t(`${game}.enums.${enumDoc.slug}._self`) }}</p>
      </header>

      <section id="values" class="scroll-mt-24 py-10">
        <h2 class="text-xl font-semibold text-highlighted">{{ $t(`${game}.enums.values`) }}</h2>
        <div class="mt-6 overflow-x-auto border-y border-default">
          <table class="w-full border-collapse text-sm">
            <tbody>
              <tr v-for="value in enumDoc.values" :key="value" class="border-b border-muted last:border-0 align-top">
                <td class="w-1/3 px-4 py-3 font-mono font-medium text-highlighted">{{ value }}</td>
                <td class="px-4 py-3 leading-6 text-muted">{{ $t(`${game}.enums.${enumDoc.slug}.${value}`) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </article>
  </DocsShell>
</template>

<script setup lang="ts">
import { collectEnums } from '../../../../../../lib/registry-docs';

const route = useRoute();
const params = computed(() => route.params as { game?: string, slug?: string });
const game = computed(() => String(params.value.game ?? ''));
const slug = computed(() => String(params.value.slug ?? ''));
const enumDoc = computed(() => collectEnums(game.value).find(enumDoc => enumDoc.slug === slug.value));

useTitle(() => enumDoc.value?.name ?? '');

if (enumDoc.value == null) {
  throw createError({ statusCode: 404, statusMessage: 'Enum not found' });
}
</script>
