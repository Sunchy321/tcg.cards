<template>
  <div class="container mx-auto px-4 pt-2 pb-6">
    <div v-if="pending" class="flex justify-center py-12">
      <UIcon name="lucide:loader" class="text-2xl animate-spin" />
    </div>

    <div v-else-if="items.length === 0">
      <UCard>
        <div class="mb-4 flex items-center justify-end">
          <UButton
            :icon="layout === 'compact' ? 'lucide:layout-list' : 'lucide:layout-grid'"
            :label="layout === 'compact' ? $t('hearthstone.announcement.layoutCompact') : $t('hearthstone.announcement.layoutFull')"
            color="neutral"
            variant="soft"
            size="sm"
            @click="cycleLayout"
          />
        </div>
        <div class="text-center py-12 text-gray-500">
          {{ $t('hearthstone.timeline.empty') }}
        </div>
      </UCard>
    </div>

    <div v-else>
      <UCard>
        <div
          v-for="(ann, ai) in announcementGroups"
          :key="ann.announcementId"
          class="mb-6"
        >
          <div class="mb-3 flex flex-wrap items-start justify-between gap-3">
            <AnnouncementHeader
              :name="ann.name"
              :source="ann.source"
              :date="ann.date"
              :link="ann.link"
            />
            <UButton
              v-if="ai === 0"
              :icon="layout === 'compact' ? 'lucide:layout-list' : 'lucide:layout-grid'"
              :label="layout === 'compact' ? $t('hearthstone.announcement.layoutCompact') : $t('hearthstone.announcement.layoutFull')"
              color="neutral"
              variant="soft"
              size="sm"
              @click="cycleLayout"
            />
          </div>

          <div v-if="ann.ungrouped.length > 0" :class="gridClass" class="mb-4">
            <AnnouncementItemCell
              v-for="(cell, ci) in ann.ungrouped"
              :key="ci"
              :entity="cell.entity"
              :item="cell.item"
              :layout="layout"
            />
          </div>

          <div
            v-for="g in ann.groups"
            :key="g.group"
            class="mt-4"
          >
            <div class="mb-2 flex items-center gap-2">
              <button
                class="flex items-center gap-1.5 text-base font-semibold hover:opacity-70"
                @click="toggleGroup(g.group)"
              >
                {{ g.label }}
                <UIcon
                  :name="collapsedGroups.has(g.group) ? 'lucide:chevron-right' : 'lucide:chevron-down'"
                  class="text-gray-400 dark:text-gray-500"
                />
              </button>
              <UBadge color="neutral" variant="soft" size="sm">{{ g.cells.length }}</UBadge>
            </div>
            <div v-if="!collapsedGroups.has(g.group)" :class="gridClass">
              <AnnouncementItemCell
                v-for="(cell, ci) in g.cells"
                :key="ci"
                :entity="cell.entity"
                :item="cell.item"
                :layout="layout"
              />
            </div>
          </div>
        </div>
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Locale } from '#model/hearthstone/schema/basic';
import { formats } from '#model/hearthstone/schema/basic';
import type { HearthstoneConfig } from '@tcg-cards/model/user-config';
import { transformUpdate, type UpdateEntity, type UpdateSourceItem } from '~/utils/update-entity';

interface TimelineItem {
  id:                 string;
  announcementId:     string;
  type:               string;
  format:             string | null;
  group:              string | null;
  status:             string | null;
  version:            number | null;
  cardId:             string | null;
  setId:              string | null;
  ruleId:             string | null;
  relatedCards:       string[];
  relatedCardNames:   string[];
  relatedCardHashes:  (string | null)[];
  images:             Array<{ side: string, hash: string, category: string, template: string }>;
  cardName:           string | null;
  setName:            string | null;
  name:               string | null;
  date:               string | null;
  source:             string | null;
  link:               { url: string, label?: string }[] | null;
}

interface TimelineCell {
  entity: UpdateEntity | null;
  item:   TimelineItem | null;
}

interface TimelineGroup {
  group: string;
  label: string;
  cells: TimelineCell[];
}

interface AnnouncementBlock {
  announcementId: string;
  date:           string | null;
  name:           string | null;
  source:         string | null;
  link:           { url: string, label?: string }[] | null;
  ungrouped:      TimelineCell[];
  groups:         TimelineGroup[];
}

definePageMeta({
  layout: 'main',
  params: [
    { id: 'format', type: 'select' },
    { id: 'view', type: 'switch', icon: 'lucide:clock' },
  ],
});

const { $orpc } = useNuxtApp();
const route = useRoute('format-format-timeline');
const router = useRouter();
const gameLocale = useGameLocale();
const lang = computed<Locale>(() => gameLocale.value as Locale);
const { t, te } = useI18n();
const { setParams } = useParams();
const { config: gameConfig, setConfig: setGameConfig } = useUserConfig<HearthstoneConfig>();

const formatId = computed(() => route.params.format as string);

const { data: items, pending } = useAsyncData(`timeline-${formatId.value}`, () => {
  return $orpc.hearthstone.announcement.timeline({ format: formatId.value, lang: lang.value }) as Promise<TimelineItem[]>;
}, { default: () => [], watch: [formatId, lang] });

// ── Params ────────────────────────────────────────────────────────────────────

const formatLabel = (format: string) => {
  const key = `hearthstone.format.${format}`;
  return te(key) ? t(key) : format;
};

const groupLabel = (group: string) => {
  const key = `hearthstone.group.${group}`;
  return te(key) ? t(key) : group;
};

const formatItems = computed(() =>
  formats.map(f => ({ value: f, label: formatLabel(f) })),
);

setParams([
  {
    id:       'format',
    type:     'select',
    items:    formatItems,
    value:    formatId,
    onChange: (val: string) => router.push(`/format/${val}/timeline`),
  },
  {
    id:       'view',
    type:     'switch',
    value:    computed(() => true),
    onChange: (val: boolean) => router.push(val ? `/format/${formatId.value}/timeline` : `/format/${formatId.value}`),
  },
]);

// ── Layout ────────────────────────────────────────────────────────────────────

const layout = computed(() => gameConfig.value.announcementLayout ?? 'compact');

function cycleLayout() {
  setGameConfig('announcementLayout', layout.value === 'compact' ? 'full' : 'compact');
}

// ── Announcement blocks ───────────────────────────────────────────────────────

function buildCells(items: TimelineItem[]): TimelineCell[] {
  const cardItems = items.filter(it => it.type === 'card_change' || it.type === 'card_update');
  const textItems = items.filter(it => it.type !== 'card_change' && it.type !== 'card_update');
  const entities = transformUpdate(cardItems as UpdateSourceItem[]);
  return [
    ...entities.map(entity => ({ entity, item: null })),
    ...textItems.map(item => ({ entity: null, item })),
  ];
}

function splitGroups(items: TimelineItem[]): { ungrouped: TimelineItem[], groups: TimelineGroup[] } {
  const ungrouped: TimelineItem[] = [];
  const byGroup = new Map<string, TimelineItem[]>();
  for (const item of items) {
    if (item.group == null) {
      ungrouped.push(item);
    } else {
      const list = byGroup.get(item.group) ?? [];
      list.push(item);
      byGroup.set(item.group, list);
    }
  }
  const groups = [...byGroup.entries()].map(([group, list]) => ({
    group,
    label: groupLabel(group),
    cells: buildCells(list),
  }));
  return { ungrouped, groups };
}

const announcementGroups = computed<AnnouncementBlock[]>(() => {
  const byAnn = new Map<string, TimelineItem[]>();
  for (const item of items.value) {
    const list = byAnn.get(item.announcementId) ?? [];
    list.push(item);
    byAnn.set(item.announcementId, list);
  }
  return [...byAnn.entries()]
    .map(([id, list]) => {
      const { ungrouped, groups } = splitGroups(list);
      return {
        announcementId: id,
        date:           list[0]?.date ?? null,
        name:           list[0]?.name ?? null,
        source:         list[0]?.source ?? null,
        link:           list[0]?.link ?? null,
        ungrouped:      buildCells(ungrouped),
        groups,
      };
    })
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
});

const collapsedGroups = ref<Set<string>>(new Set());

function toggleGroup(group: string) {
  const next = new Set(collapsedGroups.value);
  if (next.has(group)) next.delete(group);
  else next.add(group);
  collapsedGroups.value = next;
}

const gridClass = computed(() => layout.value === 'compact'
  ? 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2'
  : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3');

useTitle(() => `${formatLabel(formatId.value)} · ${t('hearthstone.timeline.$self')}`);
</script>
