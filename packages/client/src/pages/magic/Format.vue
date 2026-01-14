<template>
    <q-page class="q-pa-md">
        <div class="row items-center q-mb-lg text-h5">
            <div class="q-mr-sm">{{ $t('magic.format.' + format) }}</div>
            <div>{{ birthAndDeath }}</div>

            <q-space />

            <div v-if="!showTimeline" class="flex items-center">
                <q-btn
                    icon="mdi-arrow-left-circle"
                    flat dense round
                    @click="toPrevDate"
                />

                <date-input
                    v-model="date"
                    class="q-mx-sm"
                    dense outlined clearable
                    :date-from="dateFrom"
                    :date-to="dateTo"
                    :events="timelineEvents"
                />

                <q-btn
                    icon="mdi-arrow-right-circle"
                    flat dense round
                    @click="toNextDate"
                />
            </div>
        </div>

        <div v-if="showTimeline">
            <!-- Ban history chart -->
            <div class="q-my-md">
                <div class="chart-wrapper">
                    <div class="flex items-center q-mb-sm">
                        <q-btn
                            icon="mdi-content-save"
                            :label="$t('magic.ui.format.save_svg')"
                            dense outline
                            @click="downloadSvg"
                        />
                    </div>
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

                        <!-- Area fill: statuses (render bottom to top) -->
                        <template v-for="s in statusRenderOrder" :key="'area-' + s">
                            <path
                                v-if="statusAreaPaths[s]"
                                :d="statusAreaPaths[s]"
                                :fill="statusColor(s)"
                                fill-opacity="1"
                            />
                        </template>

                        <!-- Labels at change points (only when total changes) -->
                        <template v-for="p in labelPoints" :key="'lbl-' + p.date">
                            <text
                                :x="outerPadding + p.x"
                                :y="chartHeight - p.labelPixelHeight - 6"
                                text-anchor="middle"
                                class="chart-total"
                            >{{ p.total }}</text>
                        </template>

                        <!-- Time ticks (uniform intervals) -->
                        <template v-for="t in xTicks" :key="t.label">
                            <line :x1="outerPadding + t.x" :y1="chartHeight - 1" :x2="outerPadding + t.x" :y2="chartHeight + 6" stroke="#999" stroke-width="1" />
                            <text :x="outerPadding + t.x" :y="chartHeight + 16" text-anchor="middle" class="chart-date">{{ t.label }}</text>
                        </template>
                    </svg>
                    <div v-else class="text-grey">{{ $t('magic.ui.format.no_data') }}</div>
                </div>
                <!-- Legend -->
                <div class="legend q-gutter-sm q-mt-sm">
                    <div v-for="s in legendStatuses" :key="s" class="legend-item">
                        <span class="legend-color" :style="{ background: statusColor(s) }" />
                        <span class="legend-text">{{ $t('magic.legality.' + s) }}</span>
                    </div>
                </div>
            </div>

            <div v-for="n in nodes" :key="n.date" class="q-my-md">
                <div class="flex items-center q-mb-sm">
                    <span class="text-h6">{{ n.date }}</span>
                    <q-btn
                        v-for="l in n.link"
                        :key="l"
                        class="q-ml-sm"
                        icon="mdi-link"
                        flat dense round
                        :href="l"
                        target="_blank"
                    />
                </div>

                <grid
                    v-if="n.sets.length > 0"
                    v-slot="{ setId: id, status }"
                    :value="n.sets" :item-width="300" item-class="flex items-center"
                >
                    <div class="sets flex items-center q-gutter-sm">
                        <q-icon
                            :name="status === 'legal' ? 'mdi-plus' : 'mdi-minus'"
                            :class="status === 'legal' ? 'color-positive' : 'color-negative'"
                        />
                        <set-avatar :set-id="id" />
                    </div>
                </grid>

                <grid
                    v-if="n.banlist.length>0"
                    v-slot="{ cardId: id, status, score, group }"
                    :value="n.banlist" :item-width="300" item-class="flex items-center"
                >
                    <div class="banlist flex items-center q-gutter-sm">
                        <banlist-icon :status="status" :score="score" />
                        <card-avatar :id="id" class="avatar" :pauper="formatIsPauper" />
                        <span v-if="group != null" class="group">{{ groupShort(group) }}</span>
                    </div>
                </grid>
            </div>
        </div>

        <template v-else>
            <div class="flex items-center q-mb-md">
                <span class="text-h6">{{ $t('magic.ui.format.banlist') }}</span>

                <q-btn-toggle
                    v-model="order"
                    class="q-ml-md"
                    :options="orderOptions"
                    outline
                >
                    <template #name>
                        <q-icon name="mdi-cards-outline" />
                    </template>
                    <template #date>
                        <q-icon name="mdi-clock-outline" />
                    </template>
                </q-btn-toggle>
            </div>

            <grid
                v-slot="{ cardId, status, score, date: effectiveDate, group, link }"
                :value="banlist" :item-width="300" item-class="flex items-center"
            >
                <div class="banlist flex items-center q-gutter-sm">
                    <banlist-icon :status="status" :score="score" />
                    <a v-if="link.length > 0" class="date" :href="link[0]" target="_blank">{{ effectiveDate }}</a>
                    <div v-else class="date">{{ effectiveDate }}</div>
                    <card-avatar :id="cardId" class="avatar" :pauper="formatIsPauper" />
                    <span v-if="group != null" class="group">{{ groupShort(group) }}</span>
                </div>
            </grid>

            <div v-if="sets.length > 0" class="flex q-my-md">
                <span class="text-h6">{{ $t('magic.ui.format.set') }}</span>
            </div>

            <grid
                v-if="sets.length > 0"
                v-slot="{ id }"
                :value="sets.map(id => ({ id }))" :item-width="300" item-class="flex items-center"
            >
                <set-avatar :set-id="id" />
            </grid>
        </template>
    </q-page>
</template>

<script setup lang="ts">
import {
    ref, computed, watch,
} from 'vue';

import { useI18n } from 'vue-i18n';
import { useParam, useTitle } from 'store/core';
import { useGame } from 'store/games/magic';

import Grid from 'components/Grid.vue';
import DateInput from 'components/DateInput.vue';
import CardAvatar from 'components/magic/CardAvatar.vue';
import BanlistIcon from 'components/magic/BanlistIcon.vue';
import SetAvatar from 'components/magic/SetAvatar.vue';

import { Format } from '@model/magic/schema/format';
import { FormatChange, Legality } from '@model/magic/schema/game-change';

import { last, uniq } from 'lodash';

import { formats } from '@model/magic/schema/basic';
import { banlistStatusOrder, banlistSourceOrder } from '@static/magic/misc';

import { trpc } from 'src/trpc';

interface BanlistItem {
    date: string;
    link: string[];

    cardId: string;
    status: Legality;
    score?: number;
    group?: string;
}

interface TimelineNode {
    date: string;
    link: string[];

    sets:    { setId: string, status: 'legal' | 'unavailable' }[];
    banlist: { cardId: string, status: Legality, score?: number, group?: string }[];
}

const game = useGame();
const i18n = useI18n();

useTitle(() => i18n.t('magic.format.$self'));

const format = useParam('format', {
    type:    'enum',
    bind:    'params',
    name:    'id',
    inTitle: true,
    values:  formats,
    label:   v => i18n.t(`magic.format.${v}`),
});

const showTimeline = useParam('showTimeline', {
    type:    'boolean',
    bind:    'query',
    name:    'timeline',
    inTitle: true,
    icon:    ['mdi-timeline-outline', 'mdi-timeline'],
});

const date = useParam('date', {
    type: 'date',
    bind: 'query',
});

const order = useParam('order', {
    type:   'enum',
    bind:   'query',
    values: ['name', 'date'],
});

const data = ref<Format>();
const changes = ref<FormatChange[]>([]);

const orderOptions = ['name', 'date'].map(v => ({
    value: v,
    slot:  v,
}));

const dateFrom = computed(() => data.value?.birthday ?? game.birthday);
const dateTo = computed(() => data.value?.deathdate ?? new Date().toISOString().split('T')[0]);

const birthAndDeath = computed(() => {
    if (data.value?.birthday != null) {
        if (data.value?.deathdate != null) {
            return `${data.value.birthday} ~ ${data.value.deathdate}`;
        } else {
            return `${data.value.birthday} ~`;
        }
    } else {
        return '';
    }
});

const formatIsPauper = computed(() => {
    switch (format.value) {
    case 'pauper':
        return 'pauper';
    case 'pauper_commander':
    case 'pauper_duelcommander':
        return 'pdh';
    default:
        return undefined;
    }
});

const nodes = computed(() => {
    const result: TimelineNode[] = [];

    for (const c of changes.value) {
        const node = (() => {
            const value = result.find(r => r.date === c.date);

            if (value != null) {
                return value;
            } else {
                result.push({
                    date:    c.date,
                    link:    c.link ?? [],
                    sets:    [],
                    banlist: [],
                });

                return last(result)!;
            }
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
        } else {
            // TODO
        }
    }

    for (const v of result) {
        v.link = uniq(v.link);

        v.sets.sort((a, b) => {
            if (a.status !== b.status) {
                return a.status === 'legal' ? -1 : 1;
            } else {
                return a.setId < b.setId ? -1 : a.setId > b.setId ? 1 : 0;
            }
        });

        v.banlist.sort((a, b) => {
            if (a.status !== b.status) {
                return banlistStatusOrder.indexOf(a.status)
                  - banlistStatusOrder.indexOf(b.status);
            } else if (a.score !== b.score) {
                return (b.score ?? 0) - (a.score ?? 0);
            } else if (a.group !== b.group) {
                return banlistSourceOrder.indexOf(a.group ?? null)
                  - banlistSourceOrder.indexOf(b.group ?? null);
            } else {
                return a.cardId < b.cardId ? -1 : 1;
            }
        });
    }

    return result;
});

const sets = computed(() => {
    let result: string[] = [];

    for (const c of changes.value) {
        if (c.type === 'set_change') {
            if (c.date > date.value) {
                break;
            }

            if (c.status === 'legal') {
                result.push(c.setId!);
            } else {
                result = result.filter(s => s !== c.setId);
            }
        }
    }

    return result;
});

const banlist = computed(() => {
    const banlistItems = (() => {
        let result: BanlistItem[] = [];

        for (const c of changes.value) {
            if (c.type === 'card_change') {
                if (c.date > date.value) {
                    break;
                }

                if (c.status === 'legal' || c.status === 'unavailable') {
                    result = result.filter(v => v.cardId !== c.cardId);
                } else {
                    const sameIndex = result.findIndex(b => b.cardId === c.cardId);

                    const value: BanlistItem = {
                        date:   c.date,
                        link:   c.link ?? [],
                        cardId: c.cardId!,
                        status: c.status as Legality,
                        score:  c.score ?? undefined,
                        group:  c.group ?? undefined,
                    };

                    if (sameIndex === -1) {
                        result.push(value);
                    } else {
                        result.splice(sameIndex, 1, value);
                    }
                }
            }
        }

        return result;
    })();

    switch (order.value) {
    case 'name':
        banlistItems.sort((a, b) => {
            if (a.status !== b.status) {
                return banlistStatusOrder.indexOf(a.status)
                  - banlistStatusOrder.indexOf(b.status);
            }

            if (a.score !== b.score) {
                return (b.score ?? 0) - (a.score ?? 0);
            }

            if (a.group !== b.group) {
                return banlistSourceOrder.indexOf(a.group ?? null)
                  - banlistSourceOrder.indexOf(b.group ?? null);
            }

            return a.cardId < b.cardId ? -1 : 1;
        });
        break;
    case 'date':
        banlistItems.sort((a, b) => {
            if (a.group !== b.group) {
                return banlistSourceOrder.indexOf(a.group ?? null)
                  - banlistSourceOrder.indexOf(b.group ?? null);
            }

            if (a.date < b.date) {
                return -1;
            } else if (a.date > b.date) {
                return 1;
            }

            if (a.status !== b.status) {
                return banlistStatusOrder.indexOf(a.status)
                  - banlistStatusOrder.indexOf(b.status);
            }

            if (a.score !== b.score) {
                return (b.score ?? 0) - (a.score ?? 0);
            }

            return a.cardId < b.cardId ? -1 : 1;
        });
        break;
    default:
    }

    return banlistItems;
});

const timelineEvents = computed(() => {
    const result = [];

    for (const c of changes.value) {
        const v = result.find(r => r.date === c.date);

        if (v != null) {
            if (c.type === 'set_change') {
                v.color = 'cyan';
            }
        } else {
            result.push({
                date:  c.date,
                color: c.type === 'set_change' ? 'cyan' : 'orange',
            });
        }
    }

    return result;
});

// Ban history chart data
const legendStatuses: Legality[] = ['banned', 'banned_in_bo1', 'banned_as_commander', 'banned_as_companion', 'restricted', 'suspended'];

const statusColor = (s: Legality | null | undefined) => {
    switch (s) {
    case 'banned': return '#e64a19'; // deep orange
    case 'banned_in_bo1': return '#ff7043';
    case 'banned_as_commander': return '#ef5350';
    case 'banned_as_companion': return '#d81b60';
    case 'restricted': return '#fbc02d'; // amber
    case 'suspended': return '#7e57c2'; // purple
    case 'unavailable': return '#9e9e9e'; // grey (not stacked)
    case 'legal': return '#66bb6a'; // green (not stacked)
    default: return '#bdbdbd';
    }
};

// Chart defaults
const _barWidth = 20; // Original bar width (unused in area chart; kept for alignment reference)
const barPadding = 6; // Left/right inner padding
const chartHeight = 150; // Chart height
const outerPadding = 16; // Extra horizontal margin on both sides to keep labels fully visible

const _MS_PER_DAY = 24 * 60 * 60 * 1000;

const parseDateMs = (d: string) => {
    const date = d.endsWith('*') ? d.slice(0, -1) : d;

    return new Date(date + 'T00:00:00Z').getTime();
};

// Add months to a YYYY-MM-DD string (UTC)
const addMonths = (dateStr: string, months: number) => {
    const d = new Date(dateStr + 'T00:00:00Z');
    d.setUTCMonth(d.getUTCMonth() + months);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

// Extract base date series to avoid circular dependencies
const rawDates = computed(() => {
    const byDate: Record<string, true> = {};
    for (const c of changes.value) {
        if (c.type === 'card_change') {
            if (date.value != null && c.date > date.value) break;
            byDate[c.date] = true;
        }
    }
    return Object.keys(byDate).sort();
});

// Compute chart width and time span endpoints
// Left endpoint: format birthday; Right endpoint: earlier of (last record + 1 month) and today
const chartMeta = computed(() => {
    const dates = rawDates.value;

    const leftDate = data.value?.birthday ?? game.birthday ?? dates[0];
    if (!leftDate) {
        return { minMs: 0, maxMs: 0, width: 0 };
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const lastRecord = dates.length > 0 ? dates[dates.length - 1] : leftDate;
    const plusOneMonth = addMonths(lastRecord, 1);
    // Pick the earlier one
    const rightDate = plusOneMonth < todayStr ? plusOneMonth : todayStr;

    const minMs = parseDateMs(leftDate);
    const maxMs = parseDateMs(rightDate);

    // Step chart: estimate width with a minimum step (in pixels) per change point
    const stepMin = 28; // px per change point
    const estimatedWidth = Math.max(dates.length * stepMin + barPadding * 2, 320);
    return { minMs, maxMs, width: estimatedWidth };
});

const chartWidth = computed(() => chartMeta.value.width);
// Total SVG width includes outer horizontal margins
const svgWidth = computed(() => chartWidth.value + outerPadding * 2);

// Build per-date stacked data and attach x position (depends on rawDates)
const chartPoints = computed(() => {
    // Aggregate up to the currently selected date
    const byDate: Record<string, Record<Legality, number>> = {};
    const active: Record<string, Legality> = {};

    for (const c of changes.value) {
        if (c.type === 'card_change') {
            if (date.value != null && c.date > date.value) break;
            const currDate = c.date;
            if (c.status === 'legal' || c.status === 'unavailable') {
                delete active[c.cardId!];
            } else {
                active[c.cardId!] = c.status as Legality;
            }
            const bucket = byDate[currDate] ?? (byDate[currDate] = Object.fromEntries(legendStatuses.map(s => [s, 0])) as Record<Legality, number>);
            for (const st of legendStatuses) bucket[st] = 0;
            for (const s of Object.values(active)) {
                if (legendStatuses.includes(s)) bucket[s] = (bucket[s] ?? 0) + 1;
            }
        }
    }

    const dates = rawDates.value;
    const maxTotal = dates.reduce((m, d) => {
        const b = byDate[d] ?? {} as Record<Legality, number>;
        const total = legendStatuses.reduce((acc, s) => acc + (b[s] ?? 0), 0);
        return Math.max(m, total);
    }, 0);

    const maxBarHeight = 120; // px
    const minMs = chartMeta.value.minMs;
    const maxMs = chartMeta.value.maxMs;
    const spanMs = Math.max(1, maxMs - minMs);
    const innerWidth = chartWidth.value;

    const points = dates.map(d => {
        const b = byDate[d] ?? {} as Record<Legality, number>;
        const total = legendStatuses.reduce((acc, s) => acc + (b[s] ?? 0), 0);
        const segments: { status: Legality, h: number, y: number }[] = [];
        const order: Legality[] = ['restricted', 'suspended', 'banned_as_companion', 'banned_as_commander', 'banned_in_bo1', 'banned'];
        let acc = 0;
        for (const s of order) {
            const cnt = b[s] ?? 0;
            const h = maxTotal > 0 ? (maxBarHeight * cnt) / maxTotal : 0;
            segments.push({ status: s, h, y: acc + h });
            acc += h;
        }
        const pixelHeight = segments.length > 0 ? segments[segments.length - 1].y : 0;
        const dMs = parseDateMs(d);
        const ratio = spanMs > 0 ? (dMs - minMs) / spanMs : 0;
        const x = Math.round(ratio * innerWidth);

        return { date: d, segments, total, pixelHeight, x };
    });

    return points;
});

// Render order: bottom to top to avoid covering lower layers
const statusRenderOrder: Legality[] = ['restricted', 'suspended', 'banned_as_companion', 'banned_as_commander', 'banned_in_bo1', 'banned'];

// Area paths: closed polygon per status; top is cumulative top, bottom is lower boundary
const statusAreaPaths = computed<Record<Legality, string>>(() => {
    const paths: Partial<Record<Legality, string>> = {};
    const pts = chartPoints.value;
    if (pts.length === 0) return {} as Record<Legality, string>;
    const innerWidth = chartWidth.value;
    const startX = outerPadding;
    const endX = startX + innerWidth;

    for (const s of statusRenderOrder) {
        const xArr: number[] = [];
        const topArr: number[] = [];
        const botArr: number[] = [];
        let hasArea = false;
        // eslint-disable-next-line @typescript-eslint/prefer-for-of
        for (let i = 0; i < pts.length; i++) {
            const p = pts[i];
            const seg = p.segments.find(ss => ss.status === s);
            const h = seg?.h ?? 0;
            const yTop = seg ? (chartHeight - seg.y - 1) : (chartHeight - 1);
            const yBot = seg ? (chartHeight - (seg.y - seg.h) - 1) : (chartHeight - 1);
            const x = startX + p.x;
            xArr.push(x);
            topArr.push(yTop);
            botArr.push(yBot);
            if (h > 0) hasArea = true;
        }
        if (!hasArea) {
            paths[s] = '';
            continue;
        }
        const n = xArr.length;
        const parts: string[] = [];
        // Top edge: H to next change, V to next height, then H to endX
        parts.push(`M ${xArr[0]} ${topArr[0]}`);
        for (let i = 0; i < n; i++) {
            const nextX = i < n - 1 ? xArr[i + 1] : endX;

            parts.push(`H ${nextX}`);
            if (i < n - 1) parts.push(`V ${topArr[i + 1]}`);
        }
        // Right edge: vertical down to bottom at end
        parts.push(`V ${botArr[n - 1]}`);
        // Bottom edge: from right to left, step back by interval
        parts.push(`H ${xArr[n - 1]}`);
        for (let i = n - 1; i >= 1; i--) {
            parts.push(`V ${botArr[i - 1]}`);
            parts.push(`H ${xArr[i - 1]}`);
        }
        // Left edge: back to start height, then close
        parts.push(`V ${topArr[0]}`);
        parts.push('Z');
        paths[s] = parts.join(' ');
    }
    return paths as Record<Legality, string>;
});

// X-axis ticks: up to 12 uniform time intervals (depends on chartMeta and chartWidth)
const xTicks = computed(() => {
    const dates = rawDates.value;
    const { minMs, maxMs } = chartMeta.value;
    const width = chartWidth.value;
    if (dates.length === 0 || maxMs <= minMs || width <= 0) return [] as { x: number, label: string }[];
    const spanMs = maxMs - minMs;
    const maxLabels = 12;
    const ticks: { x: number, label: string }[] = [];
    for (let i = 0; i <= maxLabels; i++) {
        const ratio = i / maxLabels;
        const tMs = minMs + Math.round(spanMs * ratio);
        const x = Math.round(ratio * width);
        const d = new Date(tMs);
        const label = spanMs / _MS_PER_DAY > 24
            ? `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
            : `${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
        ticks.push({ x, label });
    }
    return ticks;
});

// Labels only when total changes
const labelPoints = computed(() => {
    const pts = chartPoints.value;
    const out: { date: string, x: number, total: number, labelPixelHeight: number }[] = [];
    for (let i = 0; i < pts.length; i++) {
        if (i === 0 || pts[i].total !== pts[i - 1].total) {
            const prevH = i > 0 ? pts[i - 1].pixelHeight : pts[i].pixelHeight;
            const currH = pts[i].pixelHeight;
            const labelPixelHeight = Math.max(prevH, currH);
            out.push({ date: pts[i].date, x: pts[i].x, total: pts[i].total, labelPixelHeight });
        }
    }
    return out;
});

const loadData = async () => {
    data.value = await trpc.magic.format.full({ formatId: format.value });
    changes.value = await trpc.magic.format.changes({ formatId: format.value });
};

const groupShort = (group?: string | null) => {
    switch (group) {
    case 'ante': return 'ante';
    case 'legendary': return 'leg.';
    case 'conspiracy': return 'consp.';
    case 'unfinity': return 'unf.';
    case 'offensive': return 'off.';
    default: return '';
    }
};

const toPrevDate = () => {
    const currDate = date.value ?? new Date().toISOString().split('T')[0];
    for (const { date: dateValue } of timelineEvents.value.slice().reverse()) {
        if (dateValue < currDate) {
            date.value = dateValue;
            return;
        }
    }
};

const toNextDate = () => {
    const currDate = date.value ?? new Date().toISOString().split('T')[0];
    for (const { date: dateValue } of timelineEvents.value) {
        if (dateValue > currDate) {
            date.value = dateValue;
            return;
        }
    }
};

const svgRef = ref<SVGSVGElement | null>(null);

const downloadSvg = () => {
    const svg = svgRef.value;
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');

    const css = `
.chart-date { font-size: 10px; fill: #808080; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', 'Apple Color Emoji', 'Segoe UI Emoji'; }
.chart-total { font-size: 11px; fill: #333; font-weight: 600; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', 'Apple Color Emoji', 'Segoe UI Emoji'; }
`;
    const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    styleEl.setAttribute('type', 'text/css');
    styleEl.appendChild(document.createTextNode(css));
    clone.insertBefore(styleEl, clone.firstChild);

    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(clone);
    const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const filename = `ban-history-${format.value}-${date.value ?? 'latest'}.svg`;
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

watch(format, loadData, { immediate: true });
</script>

<style lang="sass" scoped>
/* ...existing code from styles (unchanged)... */
.title
    font-size: 24px

.set
    padding: 5px

.banlist
    flex-wrap: nowrap

    & > .date
        flex-shrink: 0

    & > .avatar
        white-space: nowrap
        overflow: hidden
        text-overflow: ellipsis

.date
    color: grey

.group
    font-variant: small-caps

.chart-wrapper
    overflow-x: auto
    overflow-y: hidden
    border: 1px dashed #ccc
    border-radius: 6px
    padding: 8px

.chart-date
    font-size: 10px
    fill: #808080

.legend
    display: flex
    align-items: center
    flex-wrap: wrap

.legend-item
    display: inline-flex
    align-items: center

.legend-color
    width: 12px
    height: 12px
    border-radius: 2px
    display: inline-block
    margin-right: 6px

.legend-text
    font-size: 12px
    color: #666

.chart-total
    font-size: 11px
    fill: #333
</style>
