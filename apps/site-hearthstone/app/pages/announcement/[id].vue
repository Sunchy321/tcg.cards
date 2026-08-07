<template>
  <div class="container mx-auto px-4 pt-2 pb-6">
    <div v-if="pending" class="flex justify-center py-12">
      <UIcon name="lucide:loader" class="text-2xl animate-spin" />
    </div>

    <div v-else-if="!data" class="text-center py-12 text-gray-500">
      {{ $t('hearthstone.announcement.notFound') }}
    </div>

    <template v-else>
      <div class="mb-6">
        <h1 class="text-2xl font-bold">{{ data.name }}</h1>
        <div class="flex items-center gap-3 text-sm text-gray-500 mt-1">
          <span>{{ data.source }}</span>
          <span>{{ data.date }}</span>
        </div>
        <div v-if="data.link && data.link.length > 0" class="flex flex-wrap gap-2 mt-3">
          <UButton
            v-for="(l, i) in data.link"
            :key="i"
            :to="l.url"
            target="_blank"
            size="xs"
            color="neutral"
            variant="soft"
          >
            <UIcon name="lucide:external-link" class="mr-1 text-xs" />
            {{ l.label || l.url }}
          </UButton>
        </div>
      </div>

      <div v-if="data.items.length === 0" class="text-center py-8 text-gray-500">
        {{ $t('hearthstone.announcement.noItems') }}
      </div>

      <div v-else class="space-y-3">
        <div
          v-for="item in visibleItems"
          :key="item.id"
          class="rounded-lg border border-slate-400/30 bg-slate-900/70 p-4 text-white"
        >
          <div class="flex items-start gap-3">
            <TypeBadge :type="item.type" :status="item.status ?? undefined" class="shrink-0 mt-0.5" />
            <div class="flex-1 min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <span v-if="item.cardId" class="font-medium">{{ item.cardId }}</span>
                <span v-if="item.setId" class="font-medium">{{ item.setId }}</span>
                <span v-if="item.ruleId" class="font-medium">{{ item.ruleId }}</span>
                <UButton
                  v-if="item.group"
                  size="xs"
                  color="neutral"
                  variant="soft"
                  :icon="collapsedGroups.has(item.group) ? 'i-lucide-chevron-right' : 'i-lucide-chevron-down'"
                  @click="toggleGroup(item.group)"
                >
                  {{ item.group }}
                </UButton>
              </div>

              <div v-if="item.images.length > 0" class="mt-3 flex flex-wrap gap-3">
                <div
                  v-for="side in item.images"
                  :key="side.side"
                  class="w-36"
                >
                  <CardImage
                    :card-id="item.cardId"
                    :version="item.version ?? 0"
                    type="minion"
                    :render-hash="side.hash"
                    :category="side.category"
                    :variant="side.template === 'battlegrounds' ? 'battlegrounds' : 'normal'"
                  />
                  <div class="mt-1 text-center text-xs text-slate-500">{{ side.side }}</div>
                </div>
              </div>

              <div v-if="item.relatedCards && item.relatedCards.length > 0" class="mt-2 flex flex-wrap gap-1.5">
                <NuxtLink
                  v-for="rid in item.relatedCards"
                  :key="rid"
                  :to="`/card/${rid}`"
                  class="rounded bg-slate-700/70 px-2 py-0.5 text-xs text-slate-300 hover:bg-slate-600/70"
                >
                  {{ rid }}
                </NuxtLink>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { Locale } from '#model/hearthstone/schema/basic';

const { $orpc } = useNuxtApp();
const { t } = useI18n();
const route = useRoute('announcement-id');
const gameLocale = useGameLocale();
const lang = computed<Locale>(() => gameLocale.value as Locale);

definePageMeta({
  layout: 'main',
});

const { data, pending } = useAsyncData(`announcement-${route.params.id}`, () => {
  return $orpc.hearthstone.announcement.get({ id: route.params.id as string, lang: lang.value });
}, { watch: [lang] });

const collapsedGroups = ref<Set<string>>(new Set());

function toggleGroup(group: string) {
  if (collapsedGroups.value.has(group)) {
    collapsedGroups.value.delete(group);
  } else {
    collapsedGroups.value.add(group);
  }
  collapsedGroups.value = new Set(collapsedGroups.value);
}

/** Items with an expanded group stay; collapsed group members are hidden. */
const visibleItems = computed(() => {
  const items = data.value?.items ?? [];
  return items.filter(item => !item.group || !collapsedGroups.value.has(item.group));
});

useTitle(() => data.value?.name ?? t('hearthstone.announcement.$self'));
</script>
