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

      <div v-if="items.length === 0" class="py-8 text-center text-gray-500">
        {{ $t('magic.announcement.noItems') }}
      </div>

      <div v-else class="mt-6 space-y-3">
        <div v-for="item in items" :key="item.order" class="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
          <div class="flex flex-wrap items-center gap-2">
            <span class="rounded px-2 py-0.5 text-xs font-medium text-slate-700 dark:text-slate-200" :class="typePillClass(item.type)">{{ typeLabel(item.type) }}</span>
            <span v-if="item.status" class="rounded px-2 py-0.5 text-xs text-slate-700 dark:text-slate-200" :class="statusPillClass(item.status)">{{ statusLabel(item.status) }}</span>
            <span v-if="item.format" class="font-mono text-xs text-gray-500 dark:text-gray-400">{{ item.format }}</span>
            <span v-if="item.effectiveDate" class="ml-auto text-xs text-gray-500 dark:text-gray-400">
              {{ $t('magic.announcement.effectiveDate') }} · {{ item.effectiveDate }}
            </span>
          </div>

          <div v-if="sentinelCards(item).length > 0" class="mt-2 border-t border-gray-100 pt-2 dark:border-gray-800">
            <p class="mb-1 text-xs text-gray-500 dark:text-gray-400">{{ $t('magic.announcement.sentinel') }}</p>
            <div class="space-y-1">
              <div v-for="card in sentinelCards(item)" :key="card.cardId" class="flex flex-wrap items-center gap-3 text-xs">
                <span class="font-mono text-gray-700 dark:text-gray-300">{{ card.cardId }}</span>
                <span v-if="card.status" class="text-gray-600 dark:text-gray-400">{{ statusLabel(card.status) }}</span>
                <span v-if="card.effectiveDate" class="text-gray-500 dark:text-gray-500">{{ card.effectiveDate }}</span>
              </div>
            </div>
          </div>
        </div>
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
  projection:    { formats: string[], cards: ProjectionCard[] } | null;
}

definePageMeta({
  layout: 'main',
  title:  'Announcements',
});

const { $orpc } = useNuxtApp();
const route = useRoute();
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

const statusLabels: Record<string, string> = {
  banned_as_commander: '指挥官禁用',
  banned_as_companion: '行侣禁用',
  banned_in_bo1:       'BO1 禁用',
  banned:              '完全禁用',
  game_changer:        '游戏变革者',
  legal:               '合法',
  restricted:          '限制',
  suspended:           '暂停',
  unavailable:         '不可用',
  score:               '计分',
  extend:              '系列扩展',
  buff:                '增强',
  nerf:                '削弱',
  tweak:               '小更新',
  revert:              '退环境回调',
  rework:              '重做',
  text_fix:            '文本修复',
  text_adjust:         '文本调整',
  bugged:              '数据异常',
  bugfix:              'Bug 修复',
};

const typeLabel = (type: string) => typeLabels[type] ?? type;
const statusLabel = (status: string) => statusLabels[status] ?? status;

const LEGALITY_PILL: Record<string, string> = {
  banned:              'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  banned_as_commander: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  banned_as_companion: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  banned_in_bo1:       'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  restricted:          'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  suspended:           'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  game_changer:        'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  score:               'bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200',
  legal:               'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  unavailable:         'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
  extend:              'bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200',
};

const statusPillClass = (status: string) => LEGALITY_PILL[status] ?? 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';

const TYPE_PILL: Record<string, string> = {
  card_change:  'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  card_update:  'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  card_split:   'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
  card_merge:   'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
  set_change:   'bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200',
  rule_change:  'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200',
  format_birth: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  format_death: 'bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-200',
};

const typePillClass = (type: string) => TYPE_PILL[type] ?? 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';

/** The per-card expansion of a sentinel item; plain items keep their cards inline in the header row. */
function sentinelCards(item: AnnouncementItemView): ProjectionCard[] {
  if (item.cardId == null || !item.cardId.startsWith('#')) {
    return [];
  }
  return item.projection?.cards ?? [];
}
</script>
