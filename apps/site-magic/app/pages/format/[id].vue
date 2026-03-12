<template>
  <div class="pt-6">
    <!-- Title row -->
    <div class="flex items-center gap-3 mb-6">
      <h1 class="text-2xl font-bold text-white">
        {{ $t('magic.format.' + format) }}
      </h1>
      <span v-if="birthAndDeath" class="text-white/70 text-sm">{{ birthAndDeath }}</span>

      <div class="flex-1" />

      <div v-if="!showTimeline" class="flex items-center gap-2 bg-white dark:bg-gray-900 rounded-lg px-2 py-1">
        <UButton icon="lucide:arrow-left-circle" variant="ghost" color="neutral" size="sm" @click="toPrevDate" />
        <input
          type="date"
          class="bg-transparent border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded px-2 py-1 text-sm font-mono"
          :value="date ?? ''"
          :min="dateFrom ?? undefined"
          :max="dateTo"
          @change="(e) => setDate((e.target as HTMLInputElement).value || null)"
        >
        <UButton icon="lucide:arrow-right-circle" variant="ghost" color="neutral" size="sm" @click="toNextDate" />
      </div>
    </div>

    <!-- Timeline view -->
    <div v-if="showTimeline">
      <!-- Ban history chart -->
      <UCard class="mb-6">
        <div class="mb-3">
          <UButton
            icon="lucide:save"
            :label="$t('magic.ui.format.save_svg')"
            size="sm"
            variant="outline"
            @click="downloadSvg"
          />
        </div>
        <div class="overflow-x-auto overflow-y-hidden border border-dashed border-gray-200 dark:border-gray-700 rounded-lg p-3">
          <svg
            v-if="chartPoints.length > 0"
            ref="svgRef"
            width="100%"
            :height="chartHeight + 24"
            :viewBox="`0 0 ${svgWidth} ${chartHeight + 24}`"
            preserveAspectRatio="xMinYMin meet"
          >
            <!-- Axis -->
            <line :x1="outerPadding" :y1="chartHeight - 1" :x2="outerPadding + chartWidth" :y2="chartHeight - 1" stroke="#999" stroke-width="1" />

            <!-- Area fill -->
            <template v-for="s in [...banlistStatusOrder].reverse()" :key="'area-' + s">
              <path
                v-if="statusAreaPaths[s]"
                :d="statusAreaPaths[s]"
                :fill="statusColor(s)"
                fill-opacity="1"
              />
            </template>

            <!-- Labels at change points -->
            <template v-for="p in labelPoints" :key="'lbl-' + p.date">
              <text
                :x="outerPadding + p.x"
                :y="chartHeight - p.labelPixelHeight - 6"
                text-anchor="middle"
                class="chart-total"
              >{{ p.total }}</text>
            </template>

            <!-- X-axis ticks -->
            <template v-for="t in xTicks" :key="t.label">
              <line :x1="outerPadding + t.x" :y1="chartHeight - 1" :x2="outerPadding + t.x" :y2="chartHeight + 6" stroke="#999" stroke-width="1" />
              <text :x="outerPadding + t.x" :y="chartHeight + 16" text-anchor="middle" class="chart-date">{{ t.label }}</text>
            </template>
          </svg>
          <div v-else class="text-gray-400 text-sm">{{ $t('magic.ui.format.no_data') }}</div>
        </div>

        <!-- Legend -->
        <div class="flex flex-wrap gap-3 mt-3">
          <div v-for="s in banlistStatusOrder" :key="s" class="flex items-center gap-1.5">
            <span class="w-3 h-3 rounded-sm inline-block" :style="{ background: statusColor(s) }" />
            <span class="text-xs text-gray-500">{{ $t('magic.legality.' + s) }}</span>
          </div>
        </div>
      </UCard>

      <!-- Change nodes -->
      <UCard v-for="n in nodes" :key="n.date" class="mb-4">
        <div class="flex items-center gap-2 mb-3">
          <span class="text-lg font-semibold font-mono">{{ n.date }}</span>
          <a
            v-for="l in n.link"
            :key="l"
            :href="l"
            target="_blank"
            class="text-gray-400 hover:text-gray-600"
          >
            <UIcon name="lucide:link" class="w-4 h-4" />
          </a>
        </div>

        <div v-if="n.sets.length > 0" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mb-3">
          <div
            v-for="{ setId: id, status } in n.sets"
            :key="id"
            class="flex items-center gap-2"
          >
            <UIcon
              :name="status === 'legal' ? 'lucide:plus' : 'lucide:minus'"
              :class="status === 'legal' ? 'text-green-500' : 'text-red-500'"
            />
            <SetAvatar :set-id="id" />
          </div>
        </div>

        <div v-if="n.banlist.length > 0" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          <div
            v-for="{ cardId: id, status, score, group } in n.banlist"
            :key="`${id}-${status}`"
            class="flex items-center gap-2"
          >
            <BanlistStatus :status="statusKey(status, score)" />
            <CardAvatar :id="id" />
            <span v-if="group != null" class="text-xs text-gray-400 font-variant-small-caps">{{ groupShort(group) }}</span>
          </div>
        </div>
      </UCard>
    </div>

    <!-- Snapshot view -->
    <template v-else>
      <UCard class="mb-4">
        <div class="flex items-center gap-4 mb-4">
          <span class="text-lg font-semibold">{{ $t('magic.ui.format.banlist') }}</span>

          <!-- Order toggle -->
          <div class="flex gap-1">
            <UButton
              :variant="order === 'name' ? 'solid' : 'outline'"
              size="sm"
              icon="lucide:square-stack"
              @click="setOrder('name')"
            />
            <UButton
              :variant="order === 'date' ? 'solid' : 'outline'"
              size="sm"
              icon="lucide:clock"
              @click="setOrder('date')"
            />
          </div>

          <!-- Group expand toggle -->
          <UButton
            v-if="hasGroups"
            :variant="expandGroups ? 'outline' : 'solid'"
            size="sm"
            icon="lucide:folders"
            @click="setExpandGroups(!expandGroups)"
          />
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          <template
            v-for="item in displayBanlist"
            :key="item._type === 'item' ? `${item.cardId}-${item.status}` : `group-${item.group}`"
          >
            <!-- Individual card entry -->
            <div v-if="item._type === 'item'" class="flex items-center gap-2">
              <BanlistStatus :status="statusKey(item.status, item.score)" />
              <a
                v-if="item.link.length > 0"
                class="text-xs text-gray-400 shrink-0 font-mono"
                :href="item.link[0]"
                target="_blank"
              >{{ item.date }}</a>
              <span v-else class="text-xs text-gray-400 shrink-0 font-mono">{{ item.date }}</span>
              <CardAvatar :id="item.cardId" />
              <span v-if="item.group != null" class="text-xs text-gray-400 font-variant-small-caps">{{ groupShort(item.group) }}</span>
            </div>

            <!-- Collapsed group entry -->
            <div v-else class="flex items-center gap-2">
              <BanlistStatus :status="item.status" />
              <span class="text-xs text-gray-400 shrink-0 font-mono">{{ item.date }}</span>
              <UBadge :label="String(item.count)" size="sm" variant="subtle" />
              <span class="text-sm font-semibold font-variant-small-caps text-gray-300">{{ groupName(item.group) }}</span>
              <UButton
                icon="lucide:list"
                size="xs"
                variant="ghost"
                color="neutral"
                class="ml-auto"
                @click="selectedGroup = item.group"
              />
            </div>
          </template>
        </div>
      </UCard>

      <UCard v-if="sets.length > 0">
        <div class="mb-3">
          <span class="text-lg font-semibold">{{ $t('magic.ui.format.set') }}</span>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          <SetAvatar v-for="id in sets" :key="id" :set-id="id" />
        </div>
      </UCard>
    </template>

    <!-- Group cards modal -->
    <UModal
      v-model:open="groupModalOpen"
      :title="selectedGroup ? groupName(selectedGroup) : ''"
      scrollable
    >
      <template #body>
        <div class="flex flex-col gap-2">
          <div
            v-for="card in selectedGroupItems"
            :key="card.cardId"
            class="flex items-center gap-2"
          >
            <BanlistStatus :status="statusKey(card.status, card.score)" />
            <a
              v-if="card.link.length > 0"
              class="text-xs text-gray-400 shrink-0 font-mono"
              :href="card.link[0]"
              target="_blank"
            >{{ card.date }}</a>
            <span v-else class="text-xs text-gray-400 shrink-0 font-mono">{{ card.date }}</span>
            <CardAvatar :id="card.cardId" />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { uniq, last } from 'lodash-es';

import type { Format } from '#model/magic/schema/format';
import type { FormatChange, Legality } from '#model/magic/schema/game-change';

import { birthday as magicBirthday, formats as magicFormats } from '#model/magic/schema/basic';

// ── Types ──────────────────────────────────────────────────────────────────────

interface BanlistItem {
  date:   string;
  link:   string[];
  cardId: string;
  status: Legality;
  score?: number;
  group?: string;
}

interface DisplayBanlistItem extends BanlistItem {
  _type: 'item';
}

interface DisplayBanlistGroup {
  _type:  'group';
  group:  string;
  count:  number;
  status: Legality;
  date:   string;
}

type DisplayBanlistEntry = DisplayBanlistItem | DisplayBanlistGroup;

interface TimelineNode {
  date:    string;
  link:    string[];
  sets:    { setId: string, status: 'legal' | 'unavailable' }[];
  banlist: { cardId: string, status: Legality, score?: number, group?: string }[];
}

// ── Static constants ──────────────────────────────────────────────────────────

const banlistStatusOrder: Legality[] = [
  'banned', 'banned_in_bo1', 'banned_as_commander', 'banned_as_companion',
  'restricted', 'suspended', 'score',
];

const banlistSourceOrder = [null, 'ante', 'legendary', 'conspiracy', 'unfinity', 'offensive'];

// Chart layout
const chartHeight = 150;
const outerPadding = 16;
const barPadding = 6;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ── Page setup ────────────────────────────────────────────────────────────────

definePageMeta({
  layout: 'main',
  game:   'magic',
  // Static param definitions — dynamic state (items, value, onChange) is
  // registered at runtime via setParams() below.
  params: [
    { id: 'format', type: 'select' },
    { id: 'timeline', type: 'switch', icon: 'lucide:chart-gantt' },
  ],
});

const { $orpc } = useNuxtApp();
const route = useRoute('format-id');
const router = useRouter();
const i18n = useI18n();
const { setParams } = useParams();

// ── Route params / query ──────────────────────────────────────────────────────

const format = computed(() => route.params.id);
useTitle(() => i18n.t(`magic.format.${format.value}`));

const showTimeline = computed(() => route.query.timeline !== undefined);

const date = computed(() => (route.query.date as string | undefined) ?? null);

const order = computed<'name' | 'date'>(() => {
  const v = route.query.order as string | undefined;
  return v === 'date' ? 'date' : 'name';
});

const expandGroups = computed(() => route.query.expand !== undefined);

// ── Params ────────────────────────────────────────────────────────────────────

const formatList = ref<string[]>([]);

onMounted(async () => {
  const list = await $orpc.magic.format.list();
  formatList.value = [...list].sort((a, b) => {
    const ai = magicFormats.indexOf(a);
    const bi = magicFormats.indexOf(b);
    if (ai === -1 && bi === -1) return a < b ? -1 : 1;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
});

// Reactive items ref for the format select — auto-updates when formatList or
// locale changes, keeping the AppHeader dropdown in sync without a manual watch.
const formatItems = computed(() =>
  formatList.value.map(f => ({ value: f, label: i18n.t(`magic.format.${f}`) })),
);

// Register dynamic param state once.  We pass computed refs so the composable
// can read the latest items/value reactively without extra watchers.
setParams([
  {
    id:       'format',
    type:     'select',
    // ref 1 — configures the enumerable choices shown in the AppHeader dropdown
    items:    formatItems,
    // ref 2 — tracks which format is currently selected
    value:    format,
    onChange: (val: string) => router.push({ path: `/format/${val}`, query: route.query }),
  },
  {
    id:       'timeline',
    type:     'switch',
    // ref 2 — tracks the current toggle state
    value:    showTimeline,
    onChange: (val: boolean) => router.replace({ query: { ...route.query, timeline: val ? null : undefined } }),
  },
]);

// ── Helpers ───────────────────────────────────────────────────────────────────

const setDate = (d: string | null) => {
  router.push({ query: { ...route.query, date: d ?? undefined } });
};

const setOrder = (o: 'name' | 'date') => {
  router.push({ query: { ...route.query, order: o === 'name' ? undefined : o } });
};

const setExpandGroups = (v: boolean) => {
  router.push({ query: { ...route.query, expand: v ? null : undefined } });
};

const groupShort = (group: string) => {
  switch (group) {
  case 'ante': return 'ante';
  case 'legendary': return 'leg.';
  case 'conspiracy': return 'consp.';
  case 'unfinity': return 'unf.';
  case 'offensive': return 'off.';
  default: return group;
  }
};

const selectedGroup = ref<string | null>(null);
const groupModalOpen = computed({
  get: () => selectedGroup.value != null,
  set: (v: boolean) => { if (!v) selectedGroup.value = null; },
});
const selectedGroupItems = computed<BanlistItem[]>(() =>
  selectedGroup.value == null
    ? []
    : banlist.value.filter(b => b.group === selectedGroup.value),
);

const groupName = (group: string) => {
  const key = `magic.ui.format.group.${group}`;
  const result = i18n.t(key);
  return result !== key ? result : group;
};

/** Produce the status key expected by BanlistStatus (e.g. 'score-3' for scored entries) */
const statusKey = (status: Legality, score?: number | null) => {
  if (score != null) return `score-${score}`;
  return status;
};

// ── Data loading ──────────────────────────────────────────────────────────────

const data = ref<Format | null>(null);
const changes = ref<FormatChange[]>([]);

const loadData = async () => {
  const [fmtData, fmtChanges] = await Promise.all([
    $orpc.magic.format.full({ formatId: format.value }),
    $orpc.magic.format.changes({ formatId: format.value }),
  ]);

  data.value = fmtData;
  changes.value = fmtChanges;
};

watch(format, loadData, { immediate: true });

// ── Computed derivations ──────────────────────────────────────────────────────

const dateFrom = computed(() => data.value?.birthday ?? magicBirthday);

const dateTo = computed(() => data.value?.deathdate ?? new Date().toISOString().split('T')[0] ?? '');

const birthAndDeath = computed(() => {
  if (data.value?.birthday != null) {
    return data.value.deathdate != null
      ? `${data.value.birthday} ~ ${data.value.deathdate}`
      : `${data.value.birthday} ~`;
  }
  return '';
});

/** Timeline change nodes (sorted by date ascending) */
const nodes = computed<TimelineNode[]>(() => {
  const result: TimelineNode[] = [];

  for (const c of changes.value) {
    const node = (() => {
      const existing = result.find(r => r.date === c.date);
      if (existing) return existing;
      const n: TimelineNode = { date: c.date, link: c.link ?? [], sets: [], banlist: [] };
      result.push(n);
      return last(result)!;
    })();

    if (c.type === 'set_change') {
      node.sets.push({ setId: c.setId!, status: c.status as 'legal' | 'unavailable' });
    } else if (c.type === 'card_change') {
      node.banlist.push({
        cardId: c.cardId!,
        status: c.status as Legality,
        score:  c.score ?? undefined,
        group:  c.group ?? undefined,
      });
    }
  }

  for (const v of result) {
    v.link = uniq(v.link);

    v.sets.sort((a, b) => {
      if (a.status !== b.status) return a.status === 'legal' ? -1 : 1;
      return a.setId < b.setId ? -1 : 1;
    });

    v.banlist.sort((a, b) => {
      if (a.status !== b.status) {
        return banlistStatusOrder.indexOf(a.status) - banlistStatusOrder.indexOf(b.status);
      } else if (a.score !== b.score) {
        return (b.score ?? 0) - (a.score ?? 0);
      } else if (a.group !== b.group) {
        return banlistSourceOrder.indexOf(a.group ?? null) - banlistSourceOrder.indexOf(b.group ?? null);
      }
      return a.cardId < b.cardId ? -1 : 1;
    });
  }

  return result;
});

/** Legal sets as of current date */
const sets = computed<string[]>(() => {
  const effectiveDate = date.value ?? dateTo.value;
  let result: string[] = [];

  for (const c of changes.value) {
    if (c.type === 'set_change') {
      if (effectiveDate && c.date > effectiveDate) break;
      if (c.status === 'legal') {
        result.push(c.setId!);
      } else {
        result = result.filter(s => s !== c.setId);
      }
    }
  }
  return result;
});

/** Banlist as of current date */
const banlist = computed<BanlistItem[]>(() => {
  const effectiveDate = date.value ?? dateTo.value;
  let result: BanlistItem[] = [];

  for (const c of changes.value) {
    if (c.type === 'card_change') {
      if (effectiveDate && c.date > effectiveDate) break;

      if (c.status === 'legal' || c.status === 'unavailable') {
        result = result.filter(v => v.cardId !== c.cardId);
      } else {
        const idx = result.findIndex(b => b.cardId === c.cardId);
        const value: BanlistItem = {
          date:   c.date,
          link:   c.link ?? [],
          cardId: c.cardId!,
          status: c.status as Legality,
          score:  c.score ?? undefined,
          group:  c.group ?? undefined,
        };
        if (idx === -1) result.push(value);
        else result.splice(idx, 1, value);
      }
    }
  }

  return result;
});

const hasGroups = computed(() => banlist.value.some(b => b.group != null));

const displayBanlist = computed<DisplayBanlistEntry[]>(() => {
  if (expandGroups.value) {
    const items = banlist.value.map(item => ({ _type: 'item' as const, ...item }));
    if (order.value === 'name') {
      items.sort((a, b) => {
        if (a.status !== b.status) return banlistStatusOrder.indexOf(a.status) - banlistStatusOrder.indexOf(b.status);
        if (a.score !== b.score) return (b.score ?? 0) - (a.score ?? 0);
        if (a.group !== b.group) return banlistSourceOrder.indexOf(a.group ?? null) - banlistSourceOrder.indexOf(b.group ?? null);
        return a.cardId < b.cardId ? -1 : 1;
      });
    } else {
      items.sort((a, b) => {
        if (a.group !== b.group) return banlistSourceOrder.indexOf(a.group ?? null) - banlistSourceOrder.indexOf(b.group ?? null);
        if (a.date !== b.date) return a.date < b.date ? -1 : 1;
        if (a.status !== b.status) return banlistStatusOrder.indexOf(a.status) - banlistStatusOrder.indexOf(b.status);
        if (a.score !== b.score) return (b.score ?? 0) - (a.score ?? 0);
        return a.cardId < b.cardId ? -1 : 1;
      });
    }
    return items;
  }

  // Build group summaries
  const groupMap = new Map<string, DisplayBanlistGroup>();
  for (const item of banlist.value) {
    if (item.group == null || groupMap.has(item.group)) continue;
    const groupItems = banlist.value.filter(b => b.group === item.group);
    const count = groupItems.length;
    const status = groupItems.reduce<Legality>((best, cur) => {
      const bi = banlistStatusOrder.indexOf(best);
      const ci = banlistStatusOrder.indexOf(cur.status);
      return ci !== -1 && (bi === -1 || ci < bi) ? cur.status : best;
    }, groupItems[0]!.status);
    const date = groupItems.reduce((earliest, cur) => cur.date < earliest ? cur.date : earliest, groupItems[0]!.date);
    groupMap.set(item.group, { _type: 'group' as const, group: item.group, count, status, date });
  }

  const noGroupItems: DisplayBanlistItem[] = banlist.value
    .filter(b => b.group == null)
    .map(item => ({ _type: 'item' as const, ...item }));
  const groupEntries = [...groupMap.values()];

  if (order.value === 'name') {
    // Groups always first (in banlistSourceOrder), then individual items
    groupEntries.sort((a, b) =>
      banlistSourceOrder.indexOf(a.group) - banlistSourceOrder.indexOf(b.group),
    );
    noGroupItems.sort((a, b) => {
      if (a.status !== b.status) return banlistStatusOrder.indexOf(a.status) - banlistStatusOrder.indexOf(b.status);
      if (a.score !== b.score) return (b.score ?? 0) - (a.score ?? 0);
      return a.cardId < b.cardId ? -1 : 1;
    });
    return [...groupEntries, ...noGroupItems];
  } else {
    // date order: mix groups with individual items by their earliest date
    const all: DisplayBanlistEntry[] = [...noGroupItems, ...groupEntries];
    all.sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      if (a._type !== b._type) return a._type === 'group' ? -1 : 1;
      return 0;
    });
    return all;
  }
});

/** Events for the date navigator (dates that have changes) */
const timelineEvents = computed(() => {
  const result: { date: string, color: string }[] = [];
  for (const c of changes.value) {
    const v = result.find(r => r.date === c.date);
    if (v != null) {
      if (c.type === 'set_change') v.color = 'cyan';
    } else {
      result.push({ date: c.date, color: c.type === 'set_change' ? 'cyan' : 'orange' });
    }
  }
  return result;
});

const toPrevDate = () => {
  const curr = date.value ?? new Date().toISOString().split('T')[0] ?? '';
  for (const { date: d } of [...timelineEvents.value].reverse()) {
    if (d < curr) {
      setDate(d);
      return;
    }
  }
};

const toNextDate = () => {
  const curr = date.value ?? new Date().toISOString().split('T')[0] ?? '';
  for (const { date: d } of timelineEvents.value) {
    if (d > curr) {
      setDate(d);
      return;
    }
  }
};

// ── Chart ─────────────────────────────────────────────────────────────────────

const statusColor = (s: Legality | string) => {
  switch (s) {
  case 'banned': return '#e64a19';
  case 'banned_in_bo1': return '#ff7043';
  case 'banned_as_commander': return '#ef5350';
  case 'banned_as_companion': return '#d81b60';
  case 'restricted': return '#fbc02d';
  case 'suspended': return '#7e57c2';
  case 'unavailable': return '#9e9e9e';
  case 'legal': return '#66bb6a';
  default: return '#bdbdbd';
  }
};

const parseDateMs = (d: string) => {
  const s = d.endsWith('*') ? d.slice(0, -1) : d;
  return new Date(s + 'T00:00:00Z').getTime();
};

const addMonths = (dateStr: string, months: number) => {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + months);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
};

const rawDates = computed(() => {
  const effectiveDate = date.value;
  const byDate: Record<string, true> = {};
  for (const c of changes.value) {
    if (c.type === 'card_change') {
      if (effectiveDate != null && c.date > effectiveDate) break;
      byDate[c.date] = true;
    }
  }
  return Object.keys(byDate).sort();
});

const chartMeta = computed(() => {
  const dates = rawDates.value;
  const leftDate = data.value?.birthday ?? magicBirthday ?? dates[0];
  if (!leftDate) return { minMs: 0, maxMs: 0, width: 0 };

  const todayStr = new Date().toISOString().split('T')[0] ?? '';
  const lastRecord = dates.length > 0 ? dates[dates.length - 1]! : leftDate;
  const plusOne = addMonths(lastRecord, 1);
  const rightDate = plusOne < todayStr ? plusOne : todayStr;

  const minMs = parseDateMs(leftDate);
  const maxMs = parseDateMs(rightDate);
  const stepMin = 28;
  const estimatedWidth = Math.max(dates.length * stepMin + barPadding * 2, 320);
  return { minMs, maxMs, width: estimatedWidth };
});

const chartWidth = computed(() => chartMeta.value.width);
const svgWidth = computed(() => chartWidth.value + outerPadding * 2);

const chartPoints = computed(() => {
  const byDate: Record<string, Record<Legality, number>> = {};
  const active: Record<string, Legality | undefined> = {};

  for (const c of changes.value) {
    if (c.type === 'card_change') {
      if (date.value != null && c.date > date.value) break;
      const currDate = c.date;
      if (c.status === 'legal' || c.status === 'unavailable') {
        active[c.cardId!] = undefined;
      } else {
        active[c.cardId!] = c.status as Legality;
      }
      const bucket = byDate[currDate]
        ?? (byDate[currDate] = Object.fromEntries(banlistStatusOrder.map(s => [s, 0])) as Record<Legality, number>);
      for (const st of banlistStatusOrder) bucket[st] = 0;
      for (const s of Object.values(active)) {
        if (s != null && banlistStatusOrder.includes(s)) bucket[s] = (bucket[s] ?? 0) + 1;
      }
    }
  }

  const dates = rawDates.value;
  const maxTotal = dates.reduce((m, d) => {
    const b = byDate[d] ?? {} as Record<Legality, number>;
    const total = banlistStatusOrder.reduce((acc, s) => acc + (b[s] ?? 0), 0);
    return Math.max(m, total);
  }, 0);

  const maxBarHeight = 120;
  const { minMs, maxMs } = chartMeta.value;
  const spanMs = Math.max(1, maxMs - minMs);
  const innerWidth = chartWidth.value;

  return dates.map(d => {
    const b = byDate[d] ?? {} as Record<Legality, number>;
    const total = banlistStatusOrder.reduce((acc, s) => acc + (b[s] ?? 0), 0);
    let acc = 0;
    const segments = [...banlistStatusOrder].reverse().map(s => {
      const cnt = b[s] ?? 0;
      const h = maxTotal > 0 ? (maxBarHeight * cnt) / maxTotal : 0;
      const seg = { status: s, h, y: acc + h };
      acc += h;
      return seg;
    });
    const pixelHeight = segments[segments.length - 1]?.y ?? 0;
    const ratio = spanMs > 0 ? (parseDateMs(d) - minMs) / spanMs : 0;
    const x = Math.round(ratio * innerWidth);
    return { date: d, segments, total, pixelHeight, x };
  });
});

const statusAreaPaths = computed<Record<Legality, string>>(() => {
  const paths: Partial<Record<Legality, string>> = {};
  const pts = chartPoints.value;
  if (pts.length === 0) return {} as Record<Legality, string>;
  const innerWidth = chartWidth.value;
  const startX = outerPadding;
  const endX = startX + innerWidth;

  for (const s of [...banlistStatusOrder].reverse()) {
    const xArr: number[] = [];
    const topArr: number[] = [];
    const botArr: number[] = [];
    let hasArea = false;

    for (const p of pts) {
      const seg = p.segments.find(ss => ss.status === s);
      const h = seg?.h ?? 0;
      const yTop = seg ? (chartHeight - seg.y - 1) : (chartHeight - 1);
      const yBot = seg ? (chartHeight - (seg.y - seg.h) - 1) : (chartHeight - 1);
      xArr.push(startX + p.x);
      topArr.push(yTop);
      botArr.push(yBot);
      if (h > 0) hasArea = true;
    }

    if (!hasArea) {
      paths[s] = '';
      continue;
    }

    const n = xArr.length;
    const parts: string[] = [`M ${xArr[0]} ${topArr[0]}`];
    for (let i = 0; i < n; i++) {
      const nextX = i < n - 1 ? xArr[i + 1]! : endX;
      parts.push(`H ${nextX}`);
      if (i < n - 1) parts.push(`V ${topArr[i + 1]}`);
    }
    parts.push(`V ${botArr[n - 1]}`);
    parts.push(`H ${xArr[n - 1]}`);
    for (let i = n - 1; i >= 1; i--) {
      parts.push(`V ${botArr[i - 1]}`);
      parts.push(`H ${xArr[i - 1]}`);
    }
    parts.push(`V ${topArr[0]}`, 'Z');
    paths[s] = parts.join(' ');
  }
  return paths as Record<Legality, string>;
});

const xTicks = computed(() => {
  const { minMs, maxMs } = chartMeta.value;
  const width = chartWidth.value;
  if (rawDates.value.length === 0 || maxMs <= minMs || width <= 0) return [];

  const spanMs = maxMs - minMs;
  const maxLabels = 12;
  return Array.from({ length: maxLabels + 1 }, (_, i) => {
    const ratio = i / maxLabels;
    const tMs = minMs + Math.round(spanMs * ratio);
    const x = Math.round(ratio * width);
    const d = new Date(tMs);
    const label = spanMs / MS_PER_DAY > 24
      ? `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
      : `${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    return { x, label };
  });
});

const labelPoints = computed(() => {
  const pts = chartPoints.value;
  return pts.reduce<{ date: string, x: number, total: number, labelPixelHeight: number }[]>((acc, p, i) => {
    if (i === 0 || p.total !== pts[i - 1]!.total) {
      const prevH = i > 0 ? pts[i - 1]!.pixelHeight : p.pixelHeight;
      const labelPixelHeight = Math.max(prevH, p.pixelHeight);
      acc.push({ date: p.date, x: p.x, total: p.total, labelPixelHeight });
    }
    return acc;
  }, []);
});

// ── SVG download ─────────────────────────────────────────────────────────────

const svgRef = ref<SVGSVGElement | null>(null);

const downloadSvg = () => {
  const svg = svgRef.value;
  if (!svg) return;
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');

  const css = `
.chart-date { font-size: 10px; fill: #808080; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
.chart-total { font-size: 11px; fill: #333; font-weight: 600; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
`;
  const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  styleEl.setAttribute('type', 'text/css');
  styleEl.appendChild(document.createTextNode(css));
  clone.insertBefore(styleEl, clone.firstChild);

  const source = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ban-history-${format.value}-${date.value ?? 'latest'}.svg`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
</script>

<style scoped>
.chart-date {
  font-size: 10px;
  fill: #808080;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.chart-total {
  font-size: 11px;
  fill: #333;
  font-weight: 600;
}
</style>
