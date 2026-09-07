<template>
  <div class="desktop-page h-full space-y-4 overflow-y-auto">
    <div class="rounded-xl border border-slate-200 bg-white p-4">
      <div class="flex items-center gap-6">
        <div>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-wand-2" class="size-5 text-primary" />
            <h1 class="text-xl font-semibold">手动导入卡图</h1>
          </div>
          <p class="mt-1 text-sm text-muted">
            为指定印刷导入卡图:上传本地图片并标注来源,或按编号从 Scryfall / Gatherer 下载。上传导入的结果不会被批量导入覆盖。
          </p>
        </div>
      </div>
    </div>

    <div class="grid gap-4">
      <TaskController
        title="手动导入卡图"
        :operations="[operation]"
        @completed="onCompleted"
      >
        <template #params="{ disabled }">
          <div class="space-y-4 pt-4">
            <div class="flex flex-wrap items-center gap-x-6 gap-y-3">
              <UFormField orientation="horizontal" :ui="{ root: '!justify-start' }" label="来源" required>
                <USelect
                  v-model="form.source"
                  :items="SOURCE_OPTIONS"
                  value-key="value"
                  class="w-44"
                  :disabled="disabled"
                />
              </UFormField>
              <UFormField orientation="horizontal" :ui="{ root: '!justify-start' }" label="系列" required class="min-w-44">
                <UInputMenu
                  v-model="form.set"
                  :items="setOptions"
                  :loading="loadingSets"
                  placeholder="系列代码(如 dmu)"
                  autocomplete="off"
                  autocapitalize="off"
                  spellcheck="false"
                  :disabled="disabled || treeMode"
                />
              </UFormField>
              <UFormField orientation="horizontal" :ui="{ root: '!justify-start' }" label="语言" required>
                <USelect
                  v-model="form.lang"
                  :items="langOptions"
                  value-key="value"
                  placeholder="语言"
                  class="w-32"
                  :disabled="disabled || treeMode"
                />
              </UFormField>
              <UCheckbox v-model="form.force" label="覆盖已有卡图" :disabled="disabled" />
            </div>

            <template v-if="isZipCapable">
              <div class="grid grid-cols-2 gap-4">
                <UFormField orientation="horizontal" :ui="{ root: '!justify-start' }" label="导入方式">
                  <USelect
                    v-model="form.mode"
                    :items="modeOptions"
                    value-key="value"
                    class="w-40"
                    :disabled="disabled"
                  />
                </UFormField>
              </div>
              <template v-if="form.mode === 'single'">
                <div class="grid grid-cols-2 gap-4">
                  <UFormField orientation="horizontal" :ui="{ root: '!justify-start' }" label="编号" required>
                    <UInput v-model="form.number" placeholder="如 123" :disabled="disabled" />
                  </UFormField>
                  <UFormField orientation="horizontal" :ui="{ root: '!justify-start' }" label="面序号(可选)">
                    <UInput v-model="form.faceIndex" placeholder="留空=单面,多面填 0/1" :disabled="disabled" />
                  </UFormField>
                </div>
                <UButton :icon="file ? 'i-lucide-check' : 'i-lucide-upload'" variant="soft" :disabled="disabled" @click="pick()">
                  {{ file?.name ?? '选择单张图片(png/jpg/webp)' }}
                </UButton>
              </template>
              <template v-else>
                <UFormField orientation="horizontal" :ui="{ root: '!justify-start' }" label="压缩包路径" required class="max-w-xl">
                  <div class="flex w-full items-center gap-2">
                    <UInput
                      v-model="form.zipPath"
                      placeholder="选择或输入 zip 文件路径"
                      autocomplete="off"
                      spellcheck="false"
                      class="flex-1"
                      :disabled="disabled"
                    />
                    <UButton icon="i-lucide-folder-open" variant="soft" :disabled="disabled" @click="browse()">
                      浏览
                    </UButton>
                  </div>
                </UFormField>
                <div v-if="analyzing" class="flex items-center gap-2 text-sm text-muted">
                  <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
                  正在识别压缩包…
                </div>
                <p v-else-if="analysisError" class="text-sm text-error">{{ analysisError }}</p>
                <div v-else-if="analysis" class="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                  <div class="flex flex-wrap gap-x-6 gap-y-1">
                    <span>图片数量:<span class="font-mono">{{ analysis.entryCount }}</span></span>
                    <span>文件名格式:<span class="font-mono">{{ conventionLabel }}</span></span>
                  </div>
                  <div v-if="analysis.unrecognized.length > 0" class="text-muted">
                    未识别文件(示例):<span class="font-mono text-xs">{{ analysis.unrecognized.slice(0, 5).join('、') }}{{ analysis.unrecognized.length > 5 ? ' …' : '' }}</span>
                  </div>
                  <div v-if="analysis.candidates.length > 0" class="flex flex-wrap items-center gap-2">
                    <span class="text-muted">{{ analysis.convention === 'tree' ? '目录包含:' : '疑似系列:' }}</span>
                    <template v-if="analysis.convention === 'tree'">
                      <span
                        v-for="candidate in analysis.candidates"
                        :key="`${candidate.set}/${candidate.lang}`"
                        class="font-mono text-xs"
                      >
                        {{ candidate.set }} / {{ candidate.lang }} · {{ Math.round(candidate.rate * 100) }}%
                      </span>
                    </template>
                    <template v-else>
                      <UButton
                        v-for="candidate in analysis.candidates"
                        :key="`${candidate.set}/${candidate.lang}`"
                        :variant="form.set === candidate.set && form.lang === candidate.lang ? 'solid' : 'soft'"
                        size="xs"
                        :disabled="disabled"
                        @click="applyCandidate(candidate)"
                      >
                        {{ candidate.set }} / {{ candidate.lang }} · {{ Math.round(candidate.rate * 100) }}%
                      </UButton>
                    </template>
                  </div>
                </div>
                <p class="text-xs text-muted">
                  支持文件名「编号」「编号-面」「编号#名称」等常见格式,或与图库目录一致的「large/系列/语言/编号」结构(可含多个系列与语言),识别结果可修改。
                </p>
              </template>
            </template>
            <template v-else-if="isDownload">
              <div class="grid grid-cols-2 gap-4">
                <UFormField orientation="horizontal" :ui="{ root: '!justify-start' }" label="编号" required>
                  <UInput v-model="form.number" placeholder="如 123" :disabled="disabled" />
                </UFormField>
              </div>
              <p class="text-xs text-muted">
                将按系列、语言和编号从所选来源下载卡图,面序号按卡牌正反面自动判断。
              </p>
            </template>
            <input ref="fileInput" type="file" class="hidden" accept=".png,.jpg,.jpeg,.webp" @change="onFilePicked" />
          </div>
        </template>
      </TaskController>

      <TaskResultCard :result="countResult" />

      <div v-if="listResults.length > 0" class="rounded-xl border border-slate-200 bg-white p-4">
        <div v-for="group in listResults" :key="group.label" class="py-1 text-sm">
          <span class="font-medium">{{ group.label }}({{ group.items.length }}):</span>
          <span class="font-mono text-xs text-muted">{{ group.items.join('、') }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { TaskPageSnapshot } from '@tcg-cards/model/task';
import { locale, mainLocale } from '@tcg-cards/model/magic/schema/basic';
import { open } from '@tauri-apps/plugin-dialog';
import type { TaskOperation } from '~/components/task/TaskController.vue';
import { orpc } from '~/lib/orpc';

definePageMeta({ layout: 'admin', title: '手动导入卡图' });

const SOURCE_OPTIONS = [
  { label: '手动上传', value: 'manual' },
  { label: 'MTGCH', value: 'mtgch' },
  { label: 'MTGFlame', value: 'mtgflame' },
  { label: 'Hunterer', value: 'hunterer' },
  { type: 'separator' },
  { label: 'Scryfall', value: 'scryfall' },
  { label: 'Gatherer', value: 'gatherer' },
] as const;

/** Sources that accept local uploads. */
const zipCapableSources = ['manual', 'mtgch', 'mtgflame', 'hunterer'];

const CONVENTION_LABELS: Record<string, string> = {
  face:  '编号-面',
  named: '编号-名称',
  plain: '纯编号',
  tree:  '目录结构',
};

const LIST_LABELS: Record<string, string> = {
  unmatchedNumbers:  '未匹配编号',
  unrecognizedNames: '未识别文件',
  warnings:          '名称提示',
};

const form = useLocalPersist('magic-image-import:manual', {
  source:   'manual',
  mode:     'single',
  set:      '',
  lang:     '',
  force:    true,
  number:   '',
  faceIndex: '',
  zipPath:  '',
  fileName: '',
  dataBase64: '',
}, ['source', 'mode', 'set', 'lang', 'force', 'number', 'faceIndex', 'zipPath']);

const isZipCapable = computed(() => zipCapableSources.includes(form.source));
const isUploadSingle = computed(() => isZipCapable.value && form.mode === 'single');
const isUploadZip = computed(() => isZipCapable.value && form.mode === 'zip');
const isDownload = computed(() => form.source === 'scryfall' || form.source === 'gatherer');
const treeMode = computed(() => isUploadZip.value && analysis.value?.convention === 'tree');

/** Import modes available for the chosen source. */
const modeOptions = computed(() => {
  if (form.source === 'scryfall' || form.source === 'gatherer') return [{ label: '按编号下载', value: 'download' }];
  return [
    { label: '单张图片', value: 'single' },
    { label: '压缩包', value: 'zip' },
  ];
});

watch(() => form.source, () => {
  if (!modeOptions.value.some(option => option.value === form.mode)) {
    form.mode = modeOptions.value[0]!.value;
  }
});

const fileInput = ref<HTMLInputElement | null>(null);
const file = ref<{ name: string } | null>(null);

function pick() {
  fileInput.value?.click();
}

function onFilePicked(event: Event) {
  const input = event.target as HTMLInputElement;
  const picked = input.files?.[0];
  input.value = '';
  if (!picked) return;
  const reader = new FileReader();
  reader.onload = () => {
    form.dataBase64 = String(reader.result ?? '').split(',').pop() ?? '';
    form.fileName = picked.name;
    file.value = { name: picked.name };
  };
  reader.readAsDataURL(picked);
}

const setOptions = ref<string[]>([]);
const loadingSets = ref(false);
onMounted(async () => {
  loadingSets.value = true;
  try {
    const list = await orpc.magic.images.sets({});
    setOptions.value = list.map(x => x.code);
  } finally {
    loadingSets.value = false;
  }
});

/** Main locales first, then a separator and the remaining (secondary) locales. */
const mainCodeSet = new Set<string>(mainLocale.options);
const langOptions = [
  ...mainLocale.options.map(code => ({ label: code.toUpperCase(), value: code })),
  { type: 'separator' },
  ...locale.options.filter(code => !mainCodeSet.has(code)).map(code => ({ label: code.toUpperCase(), value: code })),
];

interface ZipCandidate {
  set:  string;
  lang: string;
  rate: number;
}

interface ZipAnalysis {
  convention:   'face' | 'named' | 'plain' | 'tree' | null;
  entryCount:   number;
  unrecognized: string[];
  candidates:   ZipCandidate[];
}

const analyzing = ref(false);
const analysis = ref<ZipAnalysis | null>(null);
const analysisError = ref('');

const conventionLabel = computed(() =>
  analysis.value ? (analysis.value.convention == null ? '未识别' : CONVENTION_LABELS[analysis.value.convention]) : '');

let analyzeTimer: ReturnType<typeof setTimeout> | null = null;
watch(() => [isUploadZip.value, form.zipPath], () => {
  analysis.value = null;
  analysisError.value = '';
  if (analyzeTimer) clearTimeout(analyzeTimer);
  if (!isUploadZip.value || !form.zipPath.trim()) return;
  analyzeTimer = setTimeout(() => void runAnalyze(), 600);
});

async function runAnalyze() {
  analyzing.value = true;
  analysisError.value = '';
  try {
    const result = await orpc.magic.analyze.manualImportZip({ zipPath: form.zipPath.trim() }) as ZipAnalysis;
    analysis.value = result;
    // Auto-fill the set/language only on a confident unique match of a flat
    // archive; tree layouts carry set/lang in their paths instead.
    const [top, second] = result.candidates;
    if (result.convention !== 'tree' && top && top.rate >= 0.9 && (!second || top.rate > second.rate)) {
      form.set = top.set;
      form.lang = top.lang;
    }
  } catch (error) {
    analysisError.value = error instanceof Error ? error.message : String(error);
  } finally {
    analyzing.value = false;
  }
}

async function browse() {
  try {
    const picked = await open({
      multiple: false,
      directory: false,
      filters: [{ name: 'Zip', extensions: ['zip'] }],
    });
    if (typeof picked === 'string') form.zipPath = picked;
  } catch {
    // Outside the desktop shell the dialog is unavailable; keep typing the path manually.
  }
}

function applyCandidate(candidate: ZipCandidate) {
  form.set = candidate.set;
  form.lang = candidate.lang;
}

function onCompleted(snap: TaskPageSnapshot) {
  taskResult.value = (snap.result as Record<string, unknown> | undefined) ?? null;
}

const taskResult = ref<Record<string, unknown> | null>(null);

const countResult = computed(() => {
  if (!taskResult.value) return null;
  return Object.fromEntries(
    Object.entries(taskResult.value).filter(([, value]) => typeof value === 'number'),
  );
});

const listResults = computed(() => {
  if (!taskResult.value) return [];
  return Object.entries(taskResult.value)
    .filter(([key, value]) => Array.isArray(value) && value.length > 0 && LIST_LABELS[key])
    .map(([key, value]) => ({ label: LIST_LABELS[key]!, items: value as string[] }));
});

const operation = computed<TaskOperation>(() => {
  const baseReady = treeMode.value || (!!form.set.trim() && !!form.lang.trim());
  const ready = isUploadSingle.value
    ? baseReady && !!form.number.trim() && !!form.dataBase64
    : isUploadZip.value
      ? baseReady && !!form.zipPath.trim()
      : baseReady && !!form.number.trim();
  return {
    key:      'manual',
    label:    '开始导入',
    icon:     'i-lucide-play',
    disabled: !ready,
    create:   async () => orpc.magic.createTask.manualImageImport({
      source:     form.source,
      set:        form.set.trim() || undefined,
      lang:       form.lang.trim() || undefined,
      force:      !!form.force,
      number:     !isUploadZip.value ? form.number.trim() || undefined : undefined,
      faceIndex:  isUploadSingle.value && form.faceIndex.trim() ? Number(form.faceIndex) : undefined,
      fileName:   isUploadSingle.value ? form.fileName || undefined : undefined,
      dataBase64: isUploadSingle.value ? form.dataBase64 : undefined,
      zipPath:    isUploadZip.value ? form.zipPath.trim() : undefined,
    }) as Promise<TaskPageSnapshot>,
  };
});
</script>
