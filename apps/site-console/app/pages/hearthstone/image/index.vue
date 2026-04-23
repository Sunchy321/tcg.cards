<template>
  <div class="space-y-4">
    <UCard>
      <div class="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-image" class="size-5 text-primary" />
            <h1 class="text-xl font-semibold">卡牌图片导出</h1>
          </div>
          <p class="mt-1 text-sm text-muted">
            导出缺失图片需求文件，供第三方工具按指定文件名生成 PNG 压缩包。
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <UBadge label="WebP 固定为 q86-m4-fast" color="primary" variant="soft" />
          <UButton
            label="刷新表单"
            icon="i-lucide-rotate-ccw"
            color="neutral"
            variant="ghost"
            @click="resetForm"
          />
        </div>
      </div>
    </UCard>

    <div class="grid gap-4 xl:grid-cols-3">
      <div class="space-y-4 xl:col-span-2">
        <UCard>
          <template #header>
            <div>
              <div class="font-medium">导出条件</div>
              <p class="mt-1 text-xs text-muted">
                默认只导出最新版本、`hand / normal / normal` 的缺失图片。
              </p>
            </div>
          </template>

          <div class="space-y-4">
            <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div class="space-y-2">
                <div class="text-xs text-muted">语言</div>
                <USelect v-model="form.lang" :items="langItems" class="w-full" />
              </div>

              <div class="space-y-2">
                <div class="text-xs text-muted">版本</div>
                <UInput
                  v-model="form.version"
                  type="number"
                  inputmode="numeric"
                  placeholder="留空表示 latest"
                />
              </div>

              <div class="space-y-2 md:col-span-2">
                <div class="text-xs text-muted">卡牌 ID</div>
                <UInput
                  v-model="form.cardId"
                  placeholder="留空表示全部卡牌"
                />
              </div>
            </div>

            <div class="grid gap-4 md:grid-cols-3">
              <div class="space-y-2">
                <div class="text-xs text-muted">展示区域</div>
                <div class="space-y-2">
                  <label
                    v-for="item in zoneItems"
                    :key="item.value"
                    class="flex items-center gap-2 rounded-lg border border-default px-3 py-2 text-sm"
                    :class="item.disabled === true ? 'cursor-not-allowed opacity-50' : ''"
                  >
                    <input
                      :checked="form.zones.includes(item.value)"
                      type="checkbox"
                      :disabled="item.disabled === true"
                      class="size-4 rounded border-default"
                      @change="toggleValue(form.zones, item.value)"
                    >
                    <span class="flex-1">{{ item.label }}</span>
                    <UBadge
                      v-if="item.disabled === true"
                      label="后续"
                      color="neutral"
                      variant="soft"
                      size="sm"
                    />
                  </label>
                </div>
              </div>

              <div class="space-y-2">
                <div class="text-xs text-muted">渲染模板</div>
                <div class="space-y-2">
                  <label
                    v-for="item in templateItems"
                    :key="item.value"
                    class="flex items-center gap-2 rounded-lg border border-default px-3 py-2 text-sm"
                  >
                    <input
                      :checked="form.templates.includes(item.value)"
                      type="checkbox"
                      class="size-4 rounded border-default"
                      @change="toggleValue(form.templates, item.value)"
                    >
                    <span>{{ item.label }}</span>
                  </label>
                </div>
              </div>

              <div class="space-y-2">
                <div class="text-xs text-muted">外观品质</div>
                <div class="space-y-2">
                  <label
                    v-for="item in premiumItems"
                    :key="item.value"
                    class="flex items-center gap-2 rounded-lg border border-default px-3 py-2 text-sm"
                  >
                    <input
                      :checked="form.premiums.includes(item.value)"
                      type="checkbox"
                      class="size-4 rounded border-default"
                      @change="toggleValue(form.premiums, item.value)"
                    >
                    <span>{{ item.label }}</span>
                  </label>
                </div>
              </div>
            </div>

            <UAlert
              color="neutral"
              variant="soft"
              icon="i-lucide-info"
              description="实际导出规则：普通/金卡仅 `hand.normal`；钻石/异画需卡牌具备对应 mechanic；战棋仅 `hand.battlegrounds.normal`；对战区 `play` 暂不导出。"
            />

            <div class="grid gap-3 md:grid-cols-2">
              <div class="space-y-2">
                <div class="text-xs text-muted">单次导出数量</div>
                <UInput
                  v-model="form.limit"
                  type="number"
                  inputmode="numeric"
                  placeholder="默认 200，最大 500"
                />
              </div>

              <div class="space-y-2">
                <div class="text-xs text-muted">继续导出游标</div>
                <div class="flex gap-2">
                  <UInput
                    v-model="form.cursor"
                    placeholder="留空表示从头开始"
                    class="flex-1"
                  />
                  <UButton
                    label="清空"
                    color="neutral"
                    variant="soft"
                    @click="form.cursor = ''"
                  />
                </div>
              </div>
            </div>

            <UAlert
              v-if="errorMessage"
              color="error"
              variant="soft"
              icon="i-lucide-circle-alert"
              :description="errorMessage"
            />

            <div class="flex flex-wrap justify-end gap-2">
              <UButton
                label="导出需求文件"
                icon="i-lucide-download"
                :loading="exporting"
                :disabled="!canExport"
                @click="submitExport"
              />
            </div>
          </div>
        </UCard>
      </div>

      <div class="space-y-4">
        <UCard>
          <template #header>
            <div class="font-medium">最近一次导出</div>
          </template>

          <div v-if="!lastResult" class="py-8 text-center text-sm text-muted">
            还没有导出记录
          </div>
          <div v-else class="space-y-3">
            <div class="rounded-lg border border-default p-3">
              <div class="text-xs text-muted">文件名</div>
              <div class="mt-1 break-all font-mono text-sm">{{ lastResult.fileName }}</div>
            </div>

            <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
              <div class="rounded-lg border border-default p-3">
                <div class="text-xs text-muted">导出 ID</div>
                <div class="mt-1 break-all font-mono text-sm">{{ lastResult.exportId }}</div>
              </div>
              <div class="rounded-lg border border-default p-3">
                <div class="text-xs text-muted">请求数量</div>
                <div class="mt-1 text-lg font-semibold">{{ lastResult.requestCount }}</div>
              </div>
              <div class="rounded-lg border border-default p-3">
                <div class="text-xs text-muted">剩余估算</div>
                <div class="mt-1 text-lg font-semibold">{{ lastResult.remainingEstimate }}</div>
              </div>
              <div class="rounded-lg border border-default p-3">
                <div class="text-xs text-muted">文件大小</div>
                <div class="mt-1 text-lg font-semibold">{{ formatHsdataBytes(lastResultBytes) }}</div>
              </div>
            </div>

            <UAlert
              :color="lastResult.hasMore ? 'warning' : 'success'"
              variant="soft"
              :icon="lastResult.hasMore ? 'i-lucide-arrow-right' : 'i-lucide-circle-check-big'"
              :description="lastResult.hasMore
                ? '当前仍有剩余缺图，可继续使用下一批游标导出。'
                : '当前筛选条件下的缺图已经导出完成。'"
            />

            <div class="space-y-2">
              <div class="text-xs text-muted">下一批游标</div>
              <div class="rounded-lg border border-default p-3">
                <div class="break-all font-mono text-xs">{{ lastResult.nextCursor ?? '-' }}</div>
              </div>
            </div>

            <div class="flex flex-wrap gap-2">
              <UButton
                label="重新下载"
                icon="i-lucide-file-down"
                color="neutral"
                variant="soft"
                @click="downloadResult(lastResult)"
              />
              <UButton
                label="使用下一批游标"
                icon="i-lucide-arrow-down-to-line"
                color="neutral"
                variant="soft"
                :disabled="lastResult.nextCursor == null"
                @click="useNextCursor"
              />
            </div>
          </div>
        </UCard>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type {
  CardImageRequirementExportResult,
  ImagePremium,
  ImageTemplate,
  ImageZone,
} from '#model/hearthstone/schema/data/image';
import type { Locale } from '#model/hearthstone/schema/basic';

import { formatHsdataBytes } from '~/composables/hearthstone-hsdata';

definePageMeta({
  layout: 'admin',
  title:  '卡牌图片导出',
});

const { $orpc } = useNuxtApp();
const toast = useToast();

const langItems: Array<{ label: string, value: Locale }> = [
  { label: '简体中文', value: 'zhs' },
  { label: 'English', value: 'en' },
  { label: '繁體中文', value: 'zht' },
  { label: '日本語', value: 'ja' },
  { label: '한국어', value: 'ko' },
  { label: 'Deutsch', value: 'de' },
  { label: 'Français', value: 'fr' },
  { label: 'Español', value: 'es' },
  { label: 'Italiano', value: 'it' },
  { label: 'Português', value: 'pt' },
  { label: 'Русский', value: 'ru' },
  { label: 'ไทย', value: 'th' },
  { label: 'Español (MX)', value: 'mx' },
  { label: 'Polski', value: 'pl' },
];

const zoneItems: Array<{ disabled?: boolean, label: string, value: ImageZone }> = [
  { label: '手牌', value: 'hand' },
  { label: '对战', value: 'play', disabled: true },
];

const templateItems: Array<{ label: string, value: ImageTemplate }> = [
  { label: '普通', value: 'normal' },
  { label: '战棋', value: 'battlegrounds' },
];

const premiumItems: Array<{ label: string, value: ImagePremium }> = [
  { label: '普通', value: 'normal' },
  { label: '金卡', value: 'golden' },
  { label: '钻石', value: 'diamond' },
  { label: '异画', value: 'signature' },
];

const form = reactive({
  lang:      'zhs' as Locale,
  cardId:    '',
  version:   '',
  zones:     ['hand'] as ImageZone[],
  templates: ['normal'] as ImageTemplate[],
  premiums:  ['normal'] as ImagePremium[],
  limit:     '200',
  cursor:    '',
});

const exporting = ref(false);
const errorMessage = ref('');
const lastResult = ref<CardImageRequirementExportResult | null>(null);

const canExport = computed(() => (
  form.zones.length > 0
  && form.templates.length > 0
  && form.premiums.length > 0
  && Number.isSafeInteger(Number(form.limit))
  && Number(form.limit) > 0
  && Number(form.limit) <= 500
));

const lastResultBytes = computed(() => {
  if (lastResult.value == null) {
    return 0;
  }

  return new Blob([lastResult.value.content]).size;
});

function resetForm() {
  form.lang = 'zhs';
  form.cardId = '';
  form.version = '';
  form.zones = ['hand'];
  form.templates = ['normal'];
  form.premiums = ['normal'];
  form.limit = '200';
  form.cursor = '';
  errorMessage.value = '';
}

function toggleValue<T>(list: T[], value: T) {
  const index = list.indexOf(value);

  if (index >= 0) {
    if (list.length > 1) {
      list.splice(index, 1);
    }

    return;
  }

  list.push(value);
}

function downloadResult(result: CardImageRequirementExportResult) {
  const blob = new Blob([result.content], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = result.fileName;
  anchor.click();

  URL.revokeObjectURL(url);
}

function useNextCursor() {
  form.cursor = lastResult.value?.nextCursor ?? '';
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message === 'No missing card images matched filters'
      ? '当前筛选条件下没有缺失图片'
      : error.message;
  }

  return '导出失败';
}

async function submitExport() {
  const limit = Number(form.limit);
  const version = form.version.trim().length === 0 ? undefined : Number(form.version);

  if (!Number.isSafeInteger(limit) || limit <= 0 || limit > 500) {
    errorMessage.value = '导出数量必须在 1 到 500 之间';
    return;
  }

  if (form.version.trim().length > 0 && (!Number.isSafeInteger(version) || Number(version) <= 0)) {
    errorMessage.value = '版本必须是正整数';
    return;
  }

  exporting.value = true;
  errorMessage.value = '';

  try {
    const result = await $orpc.hearthstone.image.exportRequirements({
      lang:      form.lang,
      cardId:    form.cardId.trim().length === 0 ? undefined : form.cardId.trim(),
      version:   version == null ? undefined : Number(version),
      zones:     [...form.zones],
      templates: [...form.templates],
      premiums:  [...form.premiums],
      limit,
      cursor:    form.cursor.trim().length === 0 ? undefined : form.cursor.trim(),
    });

    lastResult.value = result;
    downloadResult(result);

    toast.add({
      title:       '需求文件已导出',
      description: `已生成 ${result.requestCount} 个图片请求，并开始下载 JSON 文件。`,
      color:       result.hasMore ? 'warning' : 'success',
      icon:        result.hasMore ? 'i-lucide-arrow-right' : 'i-lucide-circle-check-big',
    });
  } catch (error) {
    errorMessage.value = getErrorMessage(error);
    toast.add({
      title:       '导出失败',
      description: errorMessage.value,
      color:       'error',
      icon:        'i-lucide-circle-alert',
    });
  } finally {
    exporting.value = false;
  }
}
</script>
