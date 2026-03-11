<template>
  <div class="py-6 px-6 max-w-4xl mx-auto bg-white dark:bg-gray-900 rounded-lg shadow">
    <!-- Item ID heading -->
    <div class="font-mono text-gray-400 dark:text-white/60 text-sm mb-6">{{ id }}</div>

    <!-- History list -->
    <div
      v-for="v in data?.diff ?? []"
      :key="v.dates[0]"
      class="mb-8"
    >
      <!-- Version range link(s) -->
      <div class="font-mono text-gray-400 dark:text-white/50 text-xs mb-2">
        <NuxtLink
          v-if="v.dates.length === 1"
          :to="versionLink(v.dates[0]!)"
          target="_blank"
          class="hover:text-gray-700 dark:hover:text-white/80 transition-colors"
        >
          {{ v.dates[0] }}
        </NuxtLink>
        <template v-else>
          <NuxtLink :to="versionLink(v.dates[0]!)" target="_blank" class="hover:text-gray-700 dark:hover:text-white/80 transition-colors">
            {{ v.dates[0] }}
          </NuxtLink>
          <span class="mx-1">–</span>
          <NuxtLink :to="versionLink(v.dates[v.dates.length - 1]!)" target="_blank" class="hover:text-gray-700 dark:hover:text-white/80 transition-colors">
            {{ v.dates[v.dates.length - 1] }}
          </NuxtLink>
        </template>
      </div>

      <!-- Diff text spans -->
      <RichText
        v-for="(d, i) in v.text"
        :key="i"
        :inline="true"
        :class="diffClass(d.type)"
      >
        {{ d.value }}
      </RichText>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { RuleHistory } from '#model/magic/schema/rule';

definePageMeta({
  layout: 'main',
  game:   'magic',
});

const { $orpc } = useNuxtApp();
const route = useRoute('rule-history');
const i18n = useI18n();
const title = useTitle();

title.value = i18n.t('magic.rule.history');

// ─── State ────────────────────────────────────────────────────────────────────

const id = computed(() => route.query.id as string | undefined);
const data = ref<RuleHistory | null>(null);

// ─── Helpers ──────────────────────────────────────────────────────────────────

const diffClass = (type: string) => {
  const map: Record<string, string> = {
    add:    'bg-green-100 dark:bg-green-500/30',
    remove: 'bg-red-100 dark:bg-red-500/30',
    dual:   'bg-amber-100 dark:bg-amber-500/30',
    common: '',
  };
  return map[type] ?? '';
};

const versionLink = (version: string) => ({
  path:  '/rule',
  query: { date: version },
  hash:  id.value ? `#${id.value}` : '',
});

// ─── Data loading ─────────────────────────────────────────────────────────────

watch(id, async () => {
  if (!id.value) return;
  data.value = await $orpc.magic.rule.history({ itemId: id.value });
}, { immediate: true });
</script>
