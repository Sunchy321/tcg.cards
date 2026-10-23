<template>
  <div class="desktop-page min-h-full space-y-5 p-5">
    <header class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="text-xl font-semibold text-highlighted">万智牌赛制</h1>
        <p class="mt-1 max-w-3xl text-sm text-muted">
          逐个核对赛制官网公布的禁限表与本地清单。核对只读取信息，不会修改公告或赛制数据。
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <UButton
          label="导出核对报告"
          icon="i-lucide-download"
          color="neutral"
          variant="soft"
          :loading="exportingReport"
          :disabled="exportingReport"
          @click="exportReport"
        />
        <UButton
          label="刷新赛制列表"
          icon="i-lucide-refresh-cw"
          color="neutral"
          variant="soft"
          :loading="loadingFormats"
          @click="loadFormats"
        />
      </div>
    </header>

    <p v-if="exportingReport" role="status" class="text-sm text-muted">正在重新核对全部赛制并整理报告，请稍候。</p>
    <UAlert v-if="exportError" color="error" variant="soft" title="报告暂时无法导出" :description="exportError" />

    <UAlert
      v-if="formatsError"
      color="error"
      variant="soft"
      icon="i-lucide-circle-alert"
      title="赛制列表暂时无法读取"
      :description="formatsError"
    />

    <div v-if="loadingFormats && formats.length === 0" class="flex justify-center py-12">
      <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin text-muted" />
    </div>
    <UAlert
      v-else-if="formats.length === 0 && !formatsError"
      color="neutral"
      variant="soft"
      icon="i-lucide-info"
      title="暂无赛制"
      description="本地尚未建立可供核对的万智牌赛制。"
    />

    <div v-else-if="formats.length > 0" class="grid gap-4 xl:grid-cols-2">
      <UCard v-for="format in formats" :key="format.formatId">
        <div class="space-y-4">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 class="font-semibold text-highlighted">{{ formatName(format) }}</h2>
            </div>
            <div class="flex items-center gap-2">
              <UBadge
                :label="coverageLabel(format.coverage)"
                :color="format.coverage === 'configured' ? 'success' : 'neutral'"
                variant="soft"
              />
              <UButton
                label="核对官方禁限表"
                icon="i-lucide-scale"
                size="sm"
                :disabled="format.coverage !== 'configured' || checking[format.formatId]"
                :loading="checking[format.formatId]"
                @click="compare(format.formatId)"
              />
            </div>
          </div>

          <p v-if="format.coverage !== 'configured'" class="text-sm text-muted">
            {{ coverageReason(format) }}
          </p>

          <UAlert
            v-if="requestErrors[format.formatId]"
            color="error"
            variant="soft"
            icon="i-lucide-circle-alert"
            title="核对暂时无法完成"
            :description="requestErrors[format.formatId]"
          />

          <section v-if="reports[format.formatId]" class="space-y-4 border-t border-default pt-4">
            <div class="flex flex-wrap items-center gap-2">
              <UBadge
                :label="statusLabel(reports[format.formatId]!.status)"
                :color="statusColor(reports[format.formatId]!.status)"
                variant="soft"
              />
              <span
                v-if="reports[format.formatId]!.status === 'consistent' || reports[format.formatId]!.status === 'differences'"
                class="text-sm text-muted"
              >
                官网 {{ reports[format.formatId]!.officialCount ?? '—' }} 张 · 本地 {{ reports[format.formatId]!.localCount ?? '—' }} 张
              </span>
              <p v-if="reportReason(reports[format.formatId]!)" class="text-sm text-muted">
                {{ reportReason(reports[format.formatId]!) }}
              </p>
            </div>

            <div class="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <p><span class="text-muted">管理方：</span>{{ reports[format.formatId]!.source.sourceName || '未登记' }}</p>
              <p>
                <span class="text-muted">官网更新时间：</span>
                {{ reports[format.formatId]!.source.updatedAt ?? '官网未标注' }}
              </p>
              <p>
                <span class="text-muted">本次核对：</span>
                {{ formatTime(reports[format.formatId]!.source.fetchedAt) }}
              </p>
              <p v-if="reports[format.formatId]!.source.url">
                <a
                  class="inline-flex items-center gap-1 text-primary hover:underline"
                  :href="reports[format.formatId]!.source.url"
                  target="_blank"
                  rel="noreferrer"
                >
                  查看官网清单 <UIcon name="i-lucide-external-link" class="size-3.5" />
                </a>
              </p>
            </div>

            <UAlert
              v-for="notice in reports[format.formatId]!.source.notices"
              :key="notice"
              color="warning"
              variant="soft"
              icon="i-lucide-info"
              :description="noticeText(reports[format.formatId]!.source.sourceId, notice)"
            />

            <div class="space-y-4">
              <DifferenceGroup title="官网有、本地没有" :items="reports[format.formatId]!.officialOnly" kind="officialOnly" />
              <DifferenceGroup title="本地有、官网没有" :items="reports[format.formatId]!.localOnly" kind="localOnly" />
              <DifferenceGroup title="禁限状态不同" :items="reports[format.formatId]!.statusDifferences" kind="statusDifferences" />
              <DifferenceGroup title="积分不同" :items="reports[format.formatId]!.pointsDifferences" kind="pointsDifferences" />
            </div>

            <div v-if="(reports[format.formatId]!.groups?.length ?? 0) > 0" class="space-y-2">
              <h3 class="text-sm font-medium text-highlighted">按类别核对的牌</h3>
              <ul class="space-y-1 text-sm text-muted">
                <li v-for="item in reports[format.formatId]!.groups ?? []" :key="item.group">
                  {{ groupLabel(item.group) }}（{{ item.cardCount }} 张）：已纳入核对
                </li>
              </ul>
            </div>

            <div v-if="(reports[format.formatId]!.approximateMatches?.length ?? 0) > 0" class="space-y-2">
              <h3 class="text-sm font-medium text-highlighted">模糊匹配的牌</h3>
              <p class="text-sm text-muted">以下条目已匹配，官网原文与本地卡名存在差异。</p>
              <ul class="space-y-1 text-sm">
                <li v-for="item in reports[format.formatId]!.approximateMatches ?? []" :key="`${item.cardId}:${item.officialName}`">
                  <span class="text-muted">官网：{{ item.officialName }}</span>
                  <span class="mx-2">→</span>
                  <span class="font-medium text-highlighted">{{ item.localName }}</span>
                  <span class="text-muted">（{{ item.method === 'front' ? '按正面卡名匹配' : item.method === 'parentheses' ? '忽略附注后匹配' : '近似卡名匹配' }}）</span>
                </li>
              </ul>
            </div>

            <div v-if="reports[format.formatId]!.unmatched.length > 0" class="space-y-2">
              <h3 class="text-sm font-medium text-highlighted">无法唯一匹配的牌</h3>
              <ul class="space-y-1 text-sm text-muted">
                <li v-for="item in reports[format.formatId]!.unmatched" :key="`${item.name}:${item.kind}`">
                  {{ item.name }}：{{ item.reason === 'ambiguous' ? '匹配到多张本地牌' : '本地未找到对应牌' }}
                  <span v-if="item.candidates.length > 0">（找到 {{ item.candidates.length }} 张可能对应的本地牌）</span>
                </li>
              </ul>
            </div>

            <div v-if="reports[format.formatId]!.manualReview.length > 0" class="space-y-2">
              <h3 class="text-sm font-medium text-highlighted">需要人工核实</h3>
              <ul class="list-inside list-disc space-y-1 text-sm text-muted">
                <li v-for="item in reports[format.formatId]!.manualReview" :key="item.description">
                  {{ manualReviewText(item.description) }}
                </li>
              </ul>
            </div>
          </section>
        </div>
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
import { defineComponent, h, onMounted, ref, type PropType } from 'vue';

import { useDesktopRuntimeClient } from '~/composables/useDesktopRuntimeClient';

definePageMeta({
  layout: 'admin',
  title:  '万智牌赛制',
});

const client = useDesktopRuntimeClient();
type FormatItem = Awaited<ReturnType<typeof client.magic.announcement.listOfficialFormats>>[number];
type BanlistReport = Awaited<ReturnType<typeof client.magic.announcement.compareOfficial>>;

const formats = ref<FormatItem[]>([]);
const reports = ref<Record<string, BanlistReport>>({});
const checking = ref<Record<string, boolean>>({});
const requestErrors = ref<Record<string, string>>({});
const loadingFormats = ref(false);
const formatsError = ref('');
const exportingReport = ref(false);
const exportError = ref('');

/** Downloads a fresh whole-format report without depending on previously opened results. */
async function exportReport() {
  exportingReport.value = true;
  exportError.value = '';
  try {
    const url = new URL(readDesktopRuntimeRpcUrl());
    url.pathname = '/magic/banlist-report';
    url.search = '';
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error('report unavailable');
    const report = await response.json();
    triggerJsonDownload(report, `magic-banlist-report-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  } catch {
    exportError.value = '请确认桌面运行时和本地数据库可用，然后重试。';
  } finally {
    exportingReport.value = false;
  }
}

/** Loads the local format list without clearing previously completed comparisons. */
async function loadFormats() {
  loadingFormats.value = true;
  formatsError.value = '';
  try {
    formats.value = await client.magic.announcement.listOfficialFormats({});
  } catch {
    formatsError.value = '请确认桌面运行时已启动，然后重试。';
  } finally {
    loadingFormats.value = false;
  }
}

/** Fetches one format report while preserving results already shown for other formats. */
async function compare(formatId: string) {
  checking.value[formatId] = true;
  // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
  delete requestErrors.value[formatId];
  try {
    reports.value[formatId] = await client.magic.announcement.compareOfficial({ formatId });
  } catch {
    requestErrors.value[formatId] = '请确认桌面运行时可用，然后重试。其他赛制的核对结果仍会保留。';
  } finally {
    checking.value[formatId] = false;
  }
}

/** Chooses the Simplified Chinese format name, then English, for the row heading. */
function formatName(format: FormatItem): string {
  return format.names.find(item => item.lang === 'zhs')?.name
    ?? format.names.find(item => item.lang === 'en')?.name
    ?? '万智牌赛制';
}

/** Labels source coverage in language suitable for the format list. */
function coverageLabel(status: FormatItem['coverage']): string {
  if (status === 'configured') return '可核对';
  if (status === 'not_applicable') return '不适用';
  return '来源待确认';
}

/** Translates known coverage notes into maintainer-facing product language. */
function coverageReason(format: FormatItem): string {
  const translations: Record<string, string> = {
    'The format is discontinued and has no current official list.': '该赛制已停止维护，目前没有可核对的官方清单。',
    'The format website states that it currently has no banlist.':  '该赛制官网目前没有公布禁限表。',
    'This local fork is outside the official-list check scope.':    '此赛制分支不在本次核对范围内。',
    'This format is outside the official-list check scope.':        '此赛制不在本次核对范围内。',
    'No official source has been confirmed for this format.':       '该赛制的官方清单尚未确认。',
  };
  const reason = format.coverageReason ?? '';
  return translations[reason] ?? '该赛制目前没有可核对的官方清单。';
}

/** Labels the overall comparison outcome. */
function statusLabel(status: BanlistReport['status']): string {
  if (status === 'consistent') return '一致';
  if (status === 'differences') return '存在差异';
  if (status === 'incomplete') return '尚未完整核对';
  return '无法核对';
}

/** Chooses the badge color for the overall comparison outcome. */
function statusColor(status: BanlistReport['status']): 'success' | 'warning' | 'error' | 'neutral' {
  if (status === 'consistent') return 'success';
  if (status === 'differences' || status === 'incomplete') return 'warning';
  return 'error';
}

/** Presents the source reader's failure reason in language suitable for maintainers. */
function reportReason(report: BanlistReport): string {
  if (report.status === 'unavailable') return unavailableReason(report.reason);
  if (report.status === 'incomplete') return '部分卡牌或适用范围无法完整核对，请查看下方条目并人工确认。';
  return report.reason ?? '';
}

/** Turns the source reader's failure into an actionable maintainer-facing message. */
function unavailableReason(reason: string | null): string {
  if (!reason) return '官网清单暂时无法读取。可打开官网清单检查后重试。';
  if (reason === 'The official page has no separate Standard Brawl list.') return '官网未提供独立的标准争锋清单，当前无法完成核对。';
  if (/The inherited .+ banned list could not be read completely\./.test(reason)) return '无法完整读取该赛制沿用的禁牌表，请稍后重试。';
  if (reason === 'The page did not contain the expected list content.') {
    return '已读取官网页面，但没有找到预期的清单内容。页面结构可能已变化，请打开官网检查后重试。';
  }
  if (reason === 'The official page returned an empty response.') {
    return '官网返回了空内容，请稍后重试或打开官网清单检查。';
  }
  const status = reason.match(/returned HTTP (\d{3})\./)?.[1];
  if (status) return `官网暂时拒绝或无法处理自动读取请求（HTTP ${status}）。请打开官网清单检查后重试。`;
  if (/Was there a typo in the url or port\?|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|fetch failed|network/i.test(reason)) {
    return `当前运行环境无法连接到官网：${reason}。请检查网络连接后重试。`;
  }
  return `读取官网清单失败：${reason}`;
}

/** Formats a source timestamp for the maintainer. */
function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN');
}

/** Returns a product-facing label for a restriction category or local status. */
function kindLabel(value: string | null): string {
  const labels: Record<string, string> = {
    banned:              '禁用',
    banned_in_bo1:       'BO1 禁用',
    restricted:          '限制',
    suspended:           '暂停',
    banned_as_commander: '禁作指挥官',
    banned_as_companion: '禁作行侣',
    banned_in_deck:      '禁入套牌',
    banned_as_leader:    '禁作领队',
    points:              '积分',
    score:               '积分',
  };
  return value == null ? '无' : labels[value] ?? '其他';
}

/** Names collective card restrictions in product language. */
function groupLabel(group: string): string {
  const labels: Record<string, string> = {
    ante: '赌注牌', conspiracy: '诡局牌', offensive: '冒犯性牌', unfinity: '贴纸与景点相关牌',
  };
  return labels[group] ?? '其他类别';
}

/** Translates known source notices so status limitations read consistently in Chinese. */
function noticeText(sourceId: string, _notice: string): string {
  if (sourceId === 'conquest') return '此网页处于只读状态，可能未包含之后在 Discord 发布的更新。';
  if (sourceId === 'leviathan') return '此赛制已结束，官网展示的是保留的最后一版清单。';
  return '官网清单附带了需要留意的说明，请查看官网页面。';
}

/** Translates known official-list limitations into clear follow-up guidance. */
function manualReviewText(description: string): string {
  const translations: Record<string, string> = {
    'The Vintage banned list must be checked separately.':                                         'Canadian Highlander 还沿用 Vintage 禁牌表，请同时查看该清单。',
    'The format also uses the Vintage banned list.':                                               '该赛制还沿用 Vintage 禁牌表。',
    'The Conquest card pool excludes reserved-list and other rules-defined cards.':                'Conquest 牌池还会排除保留清单牌及其他规则定义的牌。',
    'Cards removed from constructed formats, Conspiracy cards, and ante cards are also excluded.': '此外，构筑赛制移除的牌、诡局牌和赌注牌也不适用。',
    'Ante, Conspiracy, and cards removed from constructed formats are also banned.':               '此外，赌注牌、诡局牌及构筑赛制移除的牌也禁止使用。',
    'Some official restriction categories have no matching local status.':                         '部分官网禁限类别无法与本地状态直接对应，请人工确认。',
  };
  return translations[description] ?? '官网还包含无法自动核对的适用范围，请打开官网清单人工确认。';
}

/** Displays a difference list while keeping the four comparison categories distinct. */
const DifferenceGroup = defineComponent({
  props: {
    title: { type: String, required: true },
    kind:  { type: String, required: true },
    items: { type: Array as PropType<BanlistReport['officialOnly']>, required: true },
  },
  setup(props) {
    /** Keeps card-specific statuses visible inside expanded categories. */
    const renderCard = (item: BanlistReport['officialOnly'][number]) => h('li', { key: item.cardId, class: 'flex flex-wrap items-baseline gap-x-2' }, [
      h('span', { class: 'font-medium text-highlighted' }, item.name),
      props.kind === 'statusDifferences'
        ? h('span', { class: 'text-muted' }, `官网：${kindLabel(item.officialKind)} · 本地：${kindLabel(item.localStatus)}`)
        : null,
      props.kind === 'pointsDifferences'
        ? h('span', { class: 'text-muted' }, `官网：${item.officialPoints ?? '无'} · 本地：${item.localPoints ?? '无'}`)
        : null,
      item.officialKind != null && props.kind === 'officialOnly'
        ? h('span', { class: 'text-muted' }, kindLabel(item.officialKind))
        : null,
      item.localStatus != null && props.kind === 'localOnly'
        ? h('span', { class: 'text-muted' }, kindLabel(item.localStatus))
        : null,
    ]);
    return () => {
      if (props.items.length === 0) return null;
      const groups = new Map<string, BanlistReport['officialOnly']>();
      for (const item of props.items) {
        if (item.group == null) continue;
        const members = groups.get(item.group) ?? [];
        members.push(item);
        groups.set(item.group, members);
      }
      return h('section', { class: 'space-y-2' }, [
        h('h3', { class: 'text-sm font-medium text-highlighted' }, `${props.title}（${props.items.length}）`),
        h('ul', { class: 'space-y-1 text-sm' }, props.items.filter(item => item.group == null).map(renderCard)),
        ...[...groups].map(([group, members]) => h('details', { key: group, class: 'text-sm' }, [
          h('summary', { class: 'cursor-pointer font-medium text-highlighted' }, `${groupLabel(group)}（${members.length} 张）`),
          h('ul', { class: 'mt-2 space-y-1 pl-4' }, members.map(renderCard)),
        ])),
      ]);
    };
  },
});

onMounted(loadFormats);
</script>
