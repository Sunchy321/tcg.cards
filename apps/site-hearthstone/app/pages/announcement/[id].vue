<template>
  <div class="container mx-auto px-4 pt-2 pb-6">
    <div v-if="pending" class="flex justify-center py-12">
      <UIcon name="lucide:loader" class="text-2xl animate-spin" />
    </div>

    <div v-else-if="!data" class="text-center py-12 text-gray-500">
      {{ $t('hearthstone.announcement.notFound') }}
    </div>

    <template v-else>
      <UCard>
      <div class="mb-6">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <AnnouncementHeader
            :name="data.name"
            :source="data.source"
            :date="data.date"
            :link="data.link"
          />
          <UButton
            :icon="layout === 'compact' ? 'lucide:layout-list' : 'lucide:layout-grid'"
            :label="layout === 'compact' ? $t('hearthstone.announcement.layoutCompact') : $t('hearthstone.announcement.layoutFull')"
            color="neutral"
            variant="soft"
            size="sm"
            @click="cycleLayout"
          />
        </div>
      </div>

      <div v-if="sections.every(s => s.total === 0)" class="text-center py-8 text-gray-500">
        {{ $t('hearthstone.announcement.noItems') }}
      </div>

      <div v-else class="space-y-4">
        <section
          v-for="section in sections"
          :key="section.format ?? '__none__'"
        >
          <div
            v-if="section.format !== null"
            class="mb-2 mt-6 flex items-center gap-2"
          >
            <button
              class="flex items-center gap-1.5 text-xl font-bold hover:opacity-70"
              @click="toggleFormat(section.format)"
            >
              {{ section.label }}
              <UIcon
                :name="collapsedFormats.has(section.format) ? 'lucide:chevron-right' : 'lucide:chevron-down'"
                class="text-gray-400 dark:text-gray-500"
              />
            </button>
            <UBadge color="neutral" variant="soft" size="sm">{{ section.total }}</UBadge>
          </div>

          <div v-if="section.format === null || !collapsedFormats.has(section.format)">
            <div v-if="section.cells.length > 0" :class="gridClass">
              <AnnouncementItemCell
                v-for="(cell, ci) in section.cells"
                :key="ci"
                :entity="cell.entity"
                :item="cell.item"
                :layout="layout"
              />
            </div>

            <div
              v-for="g in section.groups"
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
        </section>
      </div>
      </UCard>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { Locale } from '#model/hearthstone/schema/basic';
import type { HearthstoneConfig } from '@tcg-cards/model/src/user-config';
import { transformUpdate, type UpdateEntity, type UpdateSourceItem } from '~/utils/update-entity';

interface AnnouncementSide {
  side:     string;
  hash:     string;
  category: string;
  template: string;
}

interface AnnouncementDetailItem {
  id:                string;
  type:              string;
  format:            string | null;
  group:             string | null;
  status:            string | null;
  version:           number | null;
  cardId:            string | null;
  setId:             string | null;
  ruleId:            string | null;
  relatedCards:      string[];
  relatedCardNames:  string[];
  relatedCardHashes: (string | null)[];
  images:            AnnouncementSide[];
  cardName:          string | null;
  setName:           string | null;
}

interface SectionCell {
  entity: UpdateEntity | null;
  item:   AnnouncementDetailItem | null;
}

interface GroupSection {
  group: string;
  label: string;
  cells: SectionCell[];
}

interface FormatSection {
  format: string | null;
  label:  string;
  cells:  SectionCell[];
  groups: GroupSection[];
  total:  number;
}

const { $orpc } = useNuxtApp();
const { t, te } = useI18n();
const route = useRoute('announcement-id');
const gameLocale = useGameLocale();
const lang = computed<Locale>(() => gameLocale.value as Locale);

const { config: gameConfig, setConfig: setGameConfig } = useUserConfig<HearthstoneConfig>();

definePageMeta({
  layout: 'main',
});

const { data, pending } = useAsyncData(`announcement-${route.params.id}`, () => {
  return $orpc.hearthstone.announcement.get({ id: route.params.id as string, lang: lang.value });
}, { watch: [lang] });

// ── Layout ───────────────────────────────────────────────────────────────────

const layout = computed(() => gameConfig.value.announcementLayout ?? 'compact');

function cycleLayout() {
  setGameConfig('announcementLayout', layout.value === 'compact' ? 'full' : 'compact');
}

// ── Sectioning ───────────────────────────────────────────────────────────────

const formatLabel = (format: string) => {
  const key = `hearthstone.format.${format}`;
  return te(key) ? t(key) : format;
};

const groupLabel = (group: string) => {
  const key = `hearthstone.group.${group}`;
  return te(key) ? t(key) : group;
};

function buildCells(items: AnnouncementDetailItem[]): SectionCell[] {
  const cardItems = items.filter(it => it.type === 'card_change' || it.type === 'card_update');
  const textItems = items.filter(it => it.type !== 'card_change' && it.type !== 'card_update');
  const entities = transformUpdate(cardItems as UpdateSourceItem[]);
  return [
    ...entities.map(entity => ({ entity, item: null })),
    ...textItems.map(item => ({ entity: null, item })),
  ];
}

function splitGroups(items: AnnouncementDetailItem[]): { ungrouped: AnnouncementDetailItem[], groups: GroupSection[] } {
  const ungrouped: AnnouncementDetailItem[] = [];
  const groups: GroupSection[] = [];
  const byGroup = new Map<string, AnnouncementDetailItem[]>();
  for (const item of items) {
    if (item.group == null) {
      ungrouped.push(item);
    } else {
      const list = byGroup.get(item.group) ?? [];
      list.push(item);
      byGroup.set(item.group, list);
    }
  }
  for (const [group, list] of byGroup) {
    groups.push({ group, label: groupLabel(group), cells: buildCells(list) });
  }
  return { ungrouped, groups };
}

const sections = computed<FormatSection[]>(() => {
  const items = data.value?.items ?? [];
  const noFormatItems: AnnouncementDetailItem[] = [];
  const byFormat = new Map<string, AnnouncementDetailItem[]>();
  for (const item of items) {
    if (item.format == null) {
      noFormatItems.push(item);
    } else {
      const list = byFormat.get(item.format) ?? [];
      list.push(item);
      byFormat.set(item.format, list);
    }
  }

  const result: FormatSection[] = [];
  const noFormat: FormatSection = { format: null, label: '', cells: buildCells(noFormatItems), groups: [], total: 0 };
  noFormat.total = noFormat.cells.length;
  result.push(noFormat);

  for (const [format, list] of byFormat) {
    const { ungrouped, groups } = splitGroups(list);
    const cells = buildCells(ungrouped);
    result.push({
      format,
      label: formatLabel(format),
      cells,
      groups,
      total: cells.length + groups.reduce((n, g) => n + g.cells.length, 0),
    });
  }
  return result;
});

// ── Collapse state (format sections default expanded, group blocks default collapsed) ──

const collapsedFormats = ref<Set<string>>(new Set());
const collapsedGroups = ref<Set<string>>(new Set());

// Collapse each group once when it first appears, without re-triggering on
// collapsedGroups itself, so manual expand/collapse stays under user control.
const seenGroups = new Set<string>();
watch(sections, sections => {
  const next = new Set(collapsedGroups.value);
  let changed = false;
  for (const s of sections) {
    for (const g of s.groups) {
      if (!seenGroups.has(g.group)) {
        seenGroups.add(g.group);
        next.add(g.group);
        changed = true;
      }
    }
  }
  if (changed) collapsedGroups.value = next;
}, { immediate: true });

function toggleFormat(format: string) {
  const next = new Set(collapsedFormats.value);
  if (next.has(format)) next.delete(format);
  else next.add(format);
  collapsedFormats.value = next;
}

function toggleGroup(group: string) {
  const next = new Set(collapsedGroups.value);
  if (next.has(group)) next.delete(group);
  else next.add(group);
  collapsedGroups.value = next;
}

const gridClass = computed(() => layout.value === 'compact'
  ? 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2'
  : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3');

useTitle(() => data.value?.name ?? t('hearthstone.announcement.$self'));
</script>
