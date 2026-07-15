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
            color="gray"
            variant="soft"
          >
            <UIcon name="lucide:external-link" class="mr-1 text-xs" />
            {{ l.label || l.url }}
          </UButton>
        </div>
      </div>

      <div v-if="!data.items || data.items.length === 0" class="text-center py-8 text-gray-500">
        {{ $t('hearthstone.announcement.noItems') }}
      </div>

      <div v-else class="space-y-3">
        <UCard v-for="item in data.items" :key="item.id">
          <div class="flex items-start gap-3">
            <TypeBadge :type="item.type" :status="item.status ?? undefined" class="shrink-0 mt-0.5" />
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span v-if="item.cardId" class="font-medium">{{ item.cardId }}</span>
                <span v-if="item.setId" class="font-medium">{{ item.setId }}</span>
                <span v-if="item.ruleId" class="font-medium">{{ item.ruleId }}</span>
              </div>
              <div v-if="item.delta" class="text-xs text-gray-500 mt-1 font-mono">
                {{ JSON.stringify(item.delta) }}
              </div>
            </div>
          </div>
        </UCard>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
const { $orpc } = useNuxtApp();
const { t } = useI18n();
const route = useRoute();

definePageMeta({
  layout: 'main',
});

const { data, pending } = useAsyncData(`announcement-${route.params.id}`, () => {
  return $orpc.hearthstone.announcement.get({ id: route.params.id as string }) as Promise<{
    id:      string;
    source:  string;
    date:    string;
    name:    string;
    version: number;
    link:    { url: string, label?: string }[];
    items: Array<{
      id:      string;
      type:    string;
      cardId:  string | null;
      setId:   string | null;
      ruleId:  string | null;
      status:  string | null;
      delta:   Record<string, unknown> | null;
      glow:    { part: string, type: string }[] | null;
      format:  string | null;
      formats: string[];
      cardIds: string[];
    }>;
  } | null>;
});

useTitle(() => data.value?.name ?? t('hearthstone.announcement.$self'));

</script>
