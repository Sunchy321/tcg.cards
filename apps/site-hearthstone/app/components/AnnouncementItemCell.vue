<template>
  <div class="hs-announcement-item-cell p-1">
    <div
      v-if="announcementDate || announcementName"
      class="mb-1 truncate text-[11px] text-gray-500 dark:text-gray-400"
    >
      <template v-if="announcementDate">{{ announcementDate }}</template>
      <template v-if="announcementName"><span v-if="announcementDate"> · </span>{{ announcementName }}</template>
    </div>

    <template v-if="entity">
      <div v-if="layout === 'compact'" class="flex min-w-0 items-center gap-1.5">
        <UPopover
          mode="hover"
          :content="{ side: 'top', align: 'center' }"
          :arrow="false"
          :open-delay="0"
          :close-delay="100"
          :ui="{ content: 'bg-transparent shadow-none ring-0 border-0 p-0 pointer-events-none' }"
        >
          <NuxtLink
            :to="`/card/${entity.id}`"
            target="_blank"
            class="min-w-0 truncate font-medium hover:underline"
          >
            {{ entity.name ?? entity.id }}
          </NuxtLink>
          <template #content>
            <div class="flex items-center gap-2">
              <div
                v-for="(u, ui) in entity.updates"
                :key="ui"
                class="flex items-center gap-1"
              >
                <template v-for="(side, si) in u.images" :key="side.side">
                  <CardImage
                    class="update-entity-image"
                    :card-id="u.parentId ?? entity.id"
                    :version="0"
                    type="minion"
                    :render-hash="side.hash"
                    :category="side.category"
                    :variant="variantOf(side.template)"
                  />
                  <UIcon
                    v-if="si < u.images.length - 1"
                    name="lucide:arrow-right"
                    class="shrink-0 text-gray-400 dark:text-gray-500"
                  />
                </template>
              </div>
            </div>
          </template>
        </UPopover>
        <TypeBadge v-if="entity.status" :type="entity.type" :status="entity.status" size="xs" class="shrink-0" />
      </div>

      <div v-else class="flex flex-col items-center">
        <div class="flex flex-wrap justify-center gap-2">
          <div
            v-for="(u, ui) in entity.updates"
            :key="ui"
            class="flex items-center gap-1"
          >
            <template v-for="(side, si) in u.images" :key="side.side">
              <CardImage
                class="w-28"
                :card-id="u.parentId ?? entity.id"
                :version="0"
                type="minion"
                :render-hash="side.hash"
                :category="side.category"
                :variant="variantOf(side.template)"
              />
              <UIcon
                v-if="si < u.images.length - 1"
                name="lucide:arrow-right"
                class="shrink-0 text-gray-400 dark:text-gray-500"
              />
            </template>
          </div>
        </div>
        <div class="mt-1 flex min-w-0 items-center gap-1.5">
          <NuxtLink
            :to="`/card/${entity.id}`"
            target="_blank"
            class="truncate text-sm font-medium hover:underline"
          >
            {{ entity.name ?? entity.id }}
          </NuxtLink>
          <TypeBadge v-if="entity.status" :type="entity.type" :status="entity.status" size="xs" class="shrink-0" />
        </div>
      </div>
    </template>

    <template v-else-if="item">
      <div v-if="layout === 'compact'" class="flex min-w-0 items-center gap-1.5">
        <CardUpdateAvatar
          v-if="item.type === 'card_update' && item.cardId"
          :card-id="item.cardId"
          :version="version"
          :type="item.type"
          :name="item.cardName"
          :prev="sideOf('prev')"
          :curr="sideOf('curr')"
          class="min-w-0 truncate"
        />
        <CardAvatar
          v-else-if="item.type === 'card_change' && item.cardId"
          :card-id="item.cardId"
          :version="version"
          :type="item.type"
          :name="item.cardName"
          :render-hash="sideOf('base')?.hash"
          :variant="variantOf(sideOf('base')?.template)"
          class="min-w-0 truncate"
        />
        <span v-else class="min-w-0 truncate font-medium">{{ displayText }}</span>
        <TypeBadge v-if="item.status" :type="item.type" :status="item.status" size="xs" class="shrink-0" />
      </div>

      <div v-else class="flex flex-col items-center">
        <div v-if="hasImages" class="flex flex-wrap justify-center gap-2">
          <div v-for="side in item.images" :key="side.side" class="w-28">
            <CardImage
              :card-id="item.cardId"
              :version="version"
              type="minion"
              :render-hash="side.hash"
              :category="side.category"
              :variant="variantOf(side.template)"
            />
            <div class="mt-0.5 text-center text-[11px] text-gray-500 dark:text-gray-400">{{ sideLabel(side.side) }}</div>
          </div>
        </div>
        <div class="mt-1 flex min-w-0 items-center gap-1.5">
          <span class="truncate text-sm font-medium">{{ displayText }}</span>
          <TypeBadge v-if="item.status" :type="item.type" :status="item.status" size="xs" class="shrink-0" />
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { UpdateEntity } from '~/utils/update-entity';

interface CellSide {
  side:     string;
  hash:     string;
  category: string;
  template: string;
}

interface CellItem {
  id:        string;
  type:      string;
  format?:   string | null;
  status?:   string | null;
  version?:  number | null;
  cardId?:   string | null;
  setId?:    string | null;
  ruleId?:   string | null;
  images?:   CellSide[];
  cardName?: string | null;
  setName?:  string | null;
}

const props = withDefaults(defineProps<{
  entity?:           UpdateEntity | null;
  item?:             CellItem | null;
  layout:            'compact' | 'full';
  announcementName?: string | null;
  announcementDate?: string | null;
}>(), {
  entity:           null,
  item:             null,
  announcementName: null,
  announcementDate: null,
});

const { t, te } = useI18n();

const version = computed(() => props.item?.version ?? 0);

const hasImages = computed(() => (props.item?.images?.length ?? 0) > 0);

const sideOf = (side: string) => props.item?.images?.find(s => s.side === side) ?? null;

const variantOf = (template: string | undefined) => template === 'battlegrounds' ? 'battlegrounds' : 'normal';

const sideLabel = (side: string) => {
  const key = `hearthstone.announcement.side.${side}`;
  return te(key) ? t(key) : side;
};

const formatLabel = (format: string) => {
  const key = `hearthstone.format.${format}`;
  return te(key) ? t(key) : format;
};

const ruleLabel = (ruleId: string) => {
  const season = /^bg_season:(\d+)$/.exec(ruleId);
  if (season) {
    return t('hearthstone.rule.bg-season', { n: season[1] });
  }
  return ruleId;
};

const displayText = computed(() => {
  const it = props.item;
  if (!it) return '';
  if (it.setId) return it.setName ?? it.setId;
  if (it.ruleId) return ruleLabel(it.ruleId);
  if (it.type === 'format_birth' || it.type === 'format_death') {
    return it.format ? formatLabel(it.format) : it.format ?? '';
  }
  return it.cardName ?? it.cardId ?? it.type;
});
</script>

<style>
.update-entity-image {
  width: 150px;
}
</style>
