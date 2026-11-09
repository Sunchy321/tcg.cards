<template>
  <div class="mx-auto max-w-275 px-4 pt-6 pb-10 sm:pt-8">
    <NuxtLink to="/announcement" class="mb-4 inline-flex items-center gap-2 rounded-md text-sm font-medium text-white/80 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">
      <UIcon name="lucide:arrow-left" class="size-4" aria-hidden="true" />
      {{ $t('magic.announcement.backToList') }}
    </NuxtLink>

    <div v-if="pending" class="flex justify-center rounded-2xl bg-white py-16 dark:bg-gray-900" role="status">
      <UIcon name="lucide:loader-circle" class="size-6 animate-spin text-primary-500" :aria-label="$t('magic.announcement.loading')" />
    </div>

    <div v-else-if="!data" class="rounded-2xl bg-white px-5 py-16 text-center text-gray-500 dark:bg-gray-900 dark:text-gray-400">
      {{ $t('magic.announcement.notFound') }}
    </div>

    <UCard v-else :ui="{ root: 'overflow-hidden rounded-2xl', body: 'p-0 sm:p-0' }">
      <header class="border-b border-gray-200 px-5 py-6 sm:px-8 sm:py-7 dark:border-gray-800">
        <div class="grid grid-cols-[3.5rem_minmax(0,1fr)] items-start gap-4 sm:grid-cols-[5rem_minmax(0,1fr)] sm:gap-6">
          <time :datetime="data.date" :aria-label="data.date" class="mt-1 flex flex-col items-center border-r border-gray-200 pr-3 tabular-nums sm:pr-5 dark:border-gray-800">
            <span class="text-3xl font-medium leading-none tracking-tight text-gray-700 sm:text-4xl dark:text-gray-200">{{ data.date.slice(8, 10) }}</span>
            <span class="mt-2 text-[10px] font-medium text-gray-400 sm:text-xs dark:text-gray-500">{{ data.date.slice(0, 7).replace('-', '.') }}</span>
          </time>
          <div class="min-w-0">
            <h1 class="text-xl leading-snug font-semibold tracking-tight wrap-anywhere text-gray-800 sm:text-2xl dark:text-gray-100">{{ announcementTitle(data) }}</h1>
            <div class="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
              <span class="inline-flex rounded-md bg-purple-100 px-2 py-0.5 text-[11px] leading-4 font-medium text-purple-800 dark:bg-purple-900 dark:text-purple-200">{{ sourceLabel(data.source) }}</span>
              <UButton
                v-for="(link, index) in data.link"
                :key="`${link.url}-${index}`"
                :to="link.url"
                target="_blank"
                color="neutral"
                variant="ghost"
                size="xs"
                trailing-icon="lucide:arrow-up-right"
              >{{ originalLinkLabel(link.label) }}</UButton>
            </div>
          </div>
        </div>
      </header>

      <div v-if="formatSections.length === 0" class="flex flex-col items-center gap-4 px-5 py-16 text-center text-sm text-gray-500 dark:text-gray-400">
        <span class="flex size-12 items-center justify-center rounded-2xl bg-primary-50 text-primary-400 dark:bg-primary-500/10" aria-hidden="true">
          <UIcon name="lucide:file-text" class="size-6" />
        </span>
        <p>{{ $t('magic.announcement.noItems') }}</p>
      </div>

      <div v-else class="space-y-8 px-5 py-6 sm:px-8 sm:py-8">
        <section v-for="section in formatSections" :key="section.key">
          <h2 class="mb-5 flex items-center gap-4 text-lg font-semibold tracking-tight text-gray-800 dark:text-gray-100">
            <span class="shrink-0">{{ section.label }}</span>
            <span class="h-px flex-1 bg-gray-100 dark:bg-gray-800" aria-hidden="true" />
          </h2>

          <div v-for="typeGroup in section.types" :key="section.key + typeGroup.type" class="mt-5 first:mt-0">
            <h3 class="mb-3 text-xs font-semibold tracking-wide text-gray-500 dark:text-gray-400">{{ typeGroup.typeLabel }}</h3>
            <div class="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              <EntryWithStatus
                v-for="row in collapseGroups(typeGroup.rows)"
                :key="row.key"
                :status="row.status"
                :score="row.score"
                class="rounded-xl px-3 py-3 text-sm ring-1 ring-gray-200/50 ring-inset dark:ring-gray-800/60"
              >
                <template v-if="row.cards">
                  <span class="text-sm font-semibold font-variant-small-caps">{{ groupName(row.group!) }}</span>
                  <UBadge :label="String(row.cards.length)" size="sm" variant="subtle" />
                </template>
                <CardAvatar v-else-if="row.cardId" :id="row.cardId" class="min-w-0 leading-6 font-medium wrap-anywhere" />
                <SetAvatar v-else-if="row.setId" :set-id="row.setId" class="min-w-0 flex-wrap leading-6 font-medium wrap-anywhere" />
                <span v-else-if="row.ruleId" class="text-sm leading-6 wrap-anywhere text-gray-600 dark:text-gray-400">{{ row.ruleId }}</span>
                <span v-if="row.group != null && !row.cards" class="text-xs text-gray-500 dark:text-gray-400">{{ groupName(row.group) }}</span>
                <span v-if="row.copiedFrom" class="text-xs text-gray-500 dark:text-gray-400">{{ $t('magic.announcement.copiedFrom', { format: formatNames(row.copiedFrom) }) }}</span>
                <template v-if="row.cards" #actions>
                  <UButton
                    icon="lucide:list"
                    size="xs"
                    variant="ghost"
                    color="neutral"
                    @click="selectedGroup = row"
                  />
                </template>
              </EntryWithStatus>
            </div>
          </div>
        </section>
      </div>
    </UCard>

    <UModal
      v-model:open="groupModalOpen"
      :title="selectedGroup?.group ? groupName(selectedGroup.group) : ''"
      scrollable
    >
      <template #body>
        <div class="flex flex-col gap-2">
          <EntryWithStatus
            v-for="card in selectedGroup?.cards ?? []"
            :key="card.key"
            :status="card.status"
            :score="card.score"
            :date="card.effectiveDate"
          >
            <CardAvatar v-if="card.cardId" :id="card.cardId" />
          </EntryWithStatus>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { useAnnouncementLabels } from '~/composables/useAnnouncementLabels';

/** One projected card and its effective legality change. */
interface ProjectionCard {
  cardId:         string;
  status:         string | null;
  effectiveDate:  string | null;
  score?:         number | null;
  sourceFormat?:  string;
  sourceFormats?: string[];
}

/** One authored announcement change and its display projection. */
interface AnnouncementItemView {
  type:          string;
  status:        string | null;
  score?:        number | null;
  effectiveDate: string | null;
  format:        string | null;
  order:         number;
  cardId:        string | null;
  setId:         string | null;
  ruleId:        string | null;
  group:         string | null;
  relatedCards:  string[];
  projection:    { formats: string[], cards: ProjectionCard[], score?: number | null } | null;
}

/** One rendered row: a card (or entity reference) with its status and effective date. */
interface DisplayRow {
  cards?:        DisplayRow[];
  copiedFrom?:   string[];
  group:         string | null;
  key:           string;
  status:        string | null;
  score:         number | null;
  effectiveDate: string | null;
  cardId:        string | null;
  setId:         string | null;
  ruleId:        string | null;
}

/** Changes of one kind within a format section. */
interface TypeGroup {
  type:      string;
  typeLabel: string;
  rows:      DisplayRow[];
}

/** A format's ordered groups of announcement changes. */
interface FormatSection {
  format: string | null;
  key:    string;
  label:  string;
  types:  TypeGroup[];
}

definePageMeta({
  layout: 'main',
  title:  'Announcements',
});

const { $orpc } = useNuxtApp();
const route = useRoute();
const { t, te, locale } = useI18n();
const { sourceLabel, announcementTitle } = useAnnouncementLabels();
const announcementId = computed(() => (route.params as { id: string }).id);

const { data, pending } = useAsyncData(`magic-announcement-${announcementId.value}`, () => {
  return $orpc.magic.announcement.full({ id: announcementId.value }) as Promise<{
    name: string; source: string; date: string; link: { url: string, label?: string }[];
    items: AnnouncementItemView[];
  }>;
});

const items = computed(() => data.value?.items ?? []);
const selectedGroup = ref<DisplayRow | null>(null);
const groupModalOpen = computed({
  get: () => selectedGroup.value != null,
  set: (open: boolean) => { if (!open) selectedGroup.value = null; },
});
watch(announcementId, () => {
  selectedGroup.value = null;
});

/** Labels change groups in the interface language without exposing internal type keys. */
function typeLabel(type: string): string {
  const key = `magic.announcement.types.${type}`;
  return te(key) || te(key, 'en') ? t(key) : t('magic.announcement.changes');
}

/** Labels card groups with the existing format-page translations. */
function groupName(group: string): string {
  const key = `magic.ui.format.group.${group}`;
  return te(key) ? t(key) : group;
}

/** Shows a copied card's actual source by its localized format name. */
function formatName(id: string): string {
  const key = `magic.format.${id}`;
  return te(key) ? t(key) : id;
}

function formatNames(ids: string[]): string {
  return ids.map(formatName).join(locale.value === 'zhs' ? '、' : ', ');
}

/** Gives original article links readable labels while retaining custom user labels. */
function originalLinkLabel(label?: string): string {
  if (!label?.trim()) return t('magic.announcement.readOriginal');
  const key = `magic.announcement.sources.${label}`;
  return te(key) || te(key, 'en') ? sourceLabel(label) : label;
}

/** Which entity reference an item type carries, mirroring the editor's field gating. */
function entityKind(type: string): 'card' | 'set' | 'rule' | 'none' {
  if (type === 'set_change') {
    return 'set';
  }
  if (type === 'rule_change') {
    return 'rule';
  }
  if (type === 'card_change' || type === 'card_update' || type === 'card_split' || type === 'card_merge') {
    return 'card';
  }
  return 'none';
}

/** Keeps set changes as series entries and expands card changes from their projection. */
function rowsForItem(item: AnnouncementItemView): DisplayRow[] {
  const copy = item.type === 'card_change' ? /^#\{clone:([^{}]+)\}$/.exec(item.cardId ?? '') : null;
  // Sentinel expansions inherit their group from the authored card reference.
  const group = copy != null
    ? null
    : item.type === 'card_change' && item.cardId?.startsWith('#')
      ? item.cardId.slice(1)
      : item.group ?? null;
  const projected = item.projection?.cards ?? [];
  // A group with no applicable members must not fall back to a fake sentinel card.
  if (item.type === 'card_change' && item.cardId?.startsWith('#') && projected.length === 0) {
    return [];
  }
  if (item.type !== 'set_change' && projected.length > 0) {
    return projected.map(card => ({
      group,
      copiedFrom:    copy != null ? card.sourceFormats ?? (card.sourceFormat ? [card.sourceFormat] : undefined) : undefined,
      key:           `${item.order}-${card.cardId}`,
      status:        card.status ?? item.status,
      score:         card.score ?? item.score ?? item.projection?.score ?? null,
      effectiveDate: card.effectiveDate,
      cardId:        card.cardId,
      setId:         null,
      ruleId:        null,
    }));
  }

  const kind = entityKind(item.type);
  return [{
    group,
    key:           `${item.order}`,
    status:        item.status,
    score:         item.score ?? item.projection?.score ?? null,
    effectiveDate: item.effectiveDate,
    cardId:        kind === 'card' ? item.cardId : null,
    setId:         kind === 'set' ? item.setId : null,
    ruleId:        kind === 'rule' ? item.ruleId : null,
  }];
}

/** Collapses card groups using the format banlist's status priority and list-modal interaction. */
function collapseGroups(rows: DisplayRow[]): DisplayRow[] {
  const statusOrder = [
    'banned', 'banned_in_bo1', 'banned_as_commander', 'banned_as_companion',
    'restricted', 'suspended', 'score',
  ];
  const groups = new Map<string, DisplayRow>();
  const result: DisplayRow[] = [];
  for (const row of rows) {
    if (row.group == null || row.cardId == null) {
      result.push(row);
      continue;
    }
    let summary = groups.get(row.group);
    if (summary == null) {
      summary = { ...row, key: `group-${row.group}`, cardId: null, score: null, cards: [] };
      groups.set(row.group, summary);
      result.push(summary);
    }
    summary.cards!.push(row);
    const current = statusOrder.indexOf(summary.status ?? '');
    const next = statusOrder.indexOf(row.status ?? '');
    if (next !== -1 && (current === -1 || next < current)) {
      summary.status = row.status;
    }
  }
  return result;
}

const formatSections = computed(() => {
  const sections: FormatSection[] = [];
  const sectionByFormat = new Map<string, FormatSection>();

  /** Gets or creates a format section while preserving source order. */
  const sectionOf = (format: string | null): FormatSection => {
    const key = format ?? '';
    let section = sectionByFormat.get(key);
    if (!section) {
      section = {
        format,
        key,
        label: format == null
          ? (te('magic.announcement.global') ? t('magic.announcement.global') : t('magic.announcement.$self'))
          : (te(`magic.format.${format}`) ? t(`magic.format.${format}`) : format),
        types: [],
      };
      sectionByFormat.set(key, section);
      sections.push(section);
    }
    return section;
  };

  /** Gets or creates a change group within a resolved format section. */
  const typeGroupOf = (section: FormatSection, type: string): TypeGroup => {
    let group = section.types.find(g => g.type === type);
    if (!group) {
      group = { type, typeLabel: typeLabel(type), rows: [] };
      section.types.push(group);
    }
    return group;
  };

  for (const item of items.value) {
    // Keywords belong to authored data; sections display their resolved formats.
    // An empty projection can mean the format did not exist yet; do not restore its raw id.
    const formats = item.format == null
      ? [null]
      : item.projection?.formats ?? (item.format.startsWith('#') ? [] : [item.format]);
    const rows = rowsForItem(item);
    for (const format of formats) {
      const section = sectionOf(format);
      const group = typeGroupOf(section, item.type);
      group.rows.push(...rows);
    }
  }

  return sections;
});
</script>
