<template>
  <div class="container mx-auto px-4 pt-2 pb-6">
    <div v-if="pending" class="flex justify-center py-12">
      <UIcon name="lucide:loader" class="text-2xl animate-spin" />
    </div>

    <div v-else-if="!data" class="py-12 text-center text-gray-500">
      {{ $t('magic.announcement.notFound') }}
    </div>

    <UCard v-else>
      <AnnouncementHeader
        :name="data.name"
        :source="data.source"
        :source-label="data.source"
        :date="data.date"
        :link="data.link"
      />

      <div v-if="formatSections.length === 0" class="py-8 text-center text-gray-500">
        {{ $t('magic.announcement.noItems') }}
      </div>

      <div v-else class="mt-6 space-y-8">
        <section v-for="section in formatSections" :key="section.key">
          <h2 class="mb-3 border-b border-gray-200 pb-1 text-lg font-bold dark:border-gray-800">
            {{ section.label }}
          </h2>

          <div v-for="typeGroup in section.types" :key="section.key + typeGroup.type" class="mb-4">
            <h3 class="mb-2 text-sm font-medium text-gray-500 dark:text-gray-400">{{ typeGroup.typeLabel }}</h3>
            <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <EntryWithStatus
                v-for="row in typeGroup.rows"
                :key="row.key"
                :status="row.status"
              >
                <CardAvatar v-if="row.cardId" :id="row.cardId" />
                <SetAvatar v-else-if="row.setId" :set-id="row.setId" />
                <span v-else-if="row.ruleId" class="font-mono text-sm text-gray-600 dark:text-gray-400">{{ row.ruleId }}</span>
              </EntryWithStatus>
            </div>
          </div>
        </section>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
interface ProjectionCard {
  cardId:        string;
  status:        string | null;
  effectiveDate: string | null;
}

interface AnnouncementItemView {
  type:          string;
  status:        string | null;
  effectiveDate: string | null;
  format:        string | null;
  order:         number;
  cardId:        string | null;
  setId:         string | null;
  ruleId:        string | null;
  relatedCards:  string[];
  projection:    { formats: string[], cards: ProjectionCard[] } | null;
}

/** One rendered row: a card (or entity reference) with its status and effective date. */
interface DisplayRow {
  key:           string;
  status:        string | null;
  effectiveDate: string | null;
  cardId:        string | null;
  setId:         string | null;
  ruleId:        string | null;
}

interface TypeGroup {
  type:      string;
  typeLabel: string;
  rows:      DisplayRow[];
}

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
const { t, te } = useI18n();
const announcementId = computed(() => (route.params as { id: string }).id);

const { data, pending } = useAsyncData(`magic-announcement-${announcementId.value}`, () => {
  return $orpc.magic.announcement.full({ id: announcementId.value }) as Promise<{
    name: string; source: string; date: string; link: { url: string, label?: string }[];
    items: AnnouncementItemView[];
  }>;
});

const items = computed(() => data.value?.items ?? []);

const typeLabels: Record<string, string> = {
  card_change:  '合法性变更',
  card_update:  '数值/属性变更',
  set_change:   '系列事件',
  rule_change:  '规则变更',
  format_birth: '赛制上线',
  format_death: '赛制下架',
  card_split:   '卡牌分裂',
  card_merge:   '卡牌合并',
};

const typeLabel = (type: string) => typeLabels[type] ?? type;

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

/** The rows an item renders: its projected cards when present, else its own entity reference. */
function rowsForItem(item: AnnouncementItemView): DisplayRow[] {
  const projected = item.projection?.cards ?? [];
  if (projected.length > 0) {
    return projected.map(card => ({
      key:           `${item.order}-${card.cardId}`,
      status:        card.status ?? item.status,
      effectiveDate: card.effectiveDate,
      cardId:        card.cardId,
      setId:         null,
      ruleId:        null,
    }));
  }

  const kind = entityKind(item.type);
  return [{
    key:           `${item.order}`,
    status:        item.status,
    effectiveDate: item.effectiveDate,
    cardId:        kind === 'card' ? item.cardId : null,
    setId:         kind === 'set' ? item.setId : null,
    ruleId:        kind === 'rule' ? item.ruleId : null,
  }];
}

const formatSections = computed(() => {
  const sections: FormatSection[] = [];
  const sectionByFormat = new Map<string, FormatSection>();

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

  const typeGroupOf = (section: FormatSection, type: string): TypeGroup => {
    let group = section.types.find(g => g.type === type);
    if (!group) {
      group = { type, typeLabel: typeLabel(type), rows: [] };
      section.types.push(group);
    }
    return group;
  };

  for (const item of items.value) {
    const section = sectionOf(item.format ?? null);
    const group = typeGroupOf(section, item.type);
    group.rows.push(...rowsForItem(item));
  }

  return sections;
});
</script>
