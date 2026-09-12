<template>
  <div class="desktop-page h-full space-y-4 overflow-y-auto">
    <div class="rounded-xl border border-slate-200 bg-white p-4">
      <div class="flex items-center gap-6">
        <div>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-image" class="size-5 text-primary" />
            <h1 class="text-xl font-semibold">卡图导入</h1>
          </div>
          <p class="mt-1 text-sm text-muted">
            从 Scryfall / Gatherer 批量下载或按编号补图,或上传本地图片与压缩包;上传导入的结果不会被批量导入覆盖。
          </p>
        </div>
        <div class="ml-auto flex gap-2">
          <UButton label="打开设置" icon="i-lucide-settings" color="neutral" variant="soft" to="/settings/games/magic" />
        </div>
      </div>
    </div>

    <div class="grid gap-4">
      <TaskController
        title="卡图导入"
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
              <UFormField orientation="horizontal" :ui="{ root: '!justify-start' }" :label="isRemote ? '导入范围' : '导入方式'" required>
                <USelect
                  v-model="remoteOrUploadMode"
                  :items="modeOptions"
                  value-key="value"
                  class="w-40"
                  :disabled="disabled"
                />
              </UFormField>
              <UCheckbox v-model="form.force" label="覆盖已有卡图" :disabled="disabled" />
              <UCheckbox v-model="form.cleanupJpg" label="清理 JPG" :disabled="disabled" />
            </div>

            <div class="flex flex-wrap items-center gap-x-6 gap-y-3">
              <UFormField orientation="horizontal" :ui="{ root: '!justify-start' }" label="系列" :required="setRequired" class="min-w-56">
                <UInputMenu
                  v-model="form.set"
                  :items="setItems"
                  value-key="value"
                  :loading="loadingSets"
                  placeholder="系列代码(如 dmu)"
                  autocomplete="off"
                  autocapitalize="off"
                  spellcheck="false"
                  :disabled="disabled || treeMode"
                />
              </UFormField>
              <UFormField orientation="horizontal" :ui="{ root: '!justify-start' }" label="语言" :required="langRequired">
                <USelect
                  v-model="form.lang"
                  :items="langItems"
                  value-key="value"
                  placeholder="语言"
                  class="w-36"
                  :disabled="disabled || treeMode"
                />
              </UFormField>
              <UFormField orientation="horizontal" :ui="{ root: '!justify-start' }" label="编号" :required="isSingle" class="min-w-40">
                <UInput
                  v-model="form.number"
                  placeholder="如 123"
                  autocomplete="off"
                  spellcheck="false"
                  :disabled="disabled || !isSingle"
                />
              </UFormField>
            </div>

            <template v-if="isRemoteBatch">
              <p class="text-xs text-muted">
                {{ form.source === 'scryfall' ? '从 Scryfall 抓取官方 png 并转 q50 webp;质量按细节损失率分档;跳过手动替换过的印张。' : '从 Gatherer 按系列抓取卡图,质量不做保证,导入后按实测分档(可能大量低清,可手动替换)。' }}
              </p>
            </template>
            <template v-else-if="isUploadSingle">
              <div class="flex flex-wrap items-center gap-x-6 gap-y-3">
                <UFormField orientation="horizontal" :ui="{ root: '!justify-start' }" label="面序号(可选)">
                  <UInput v-model="form.faceIndex" placeholder="留空=单面,多面填 0/1" class="w-44" :disabled="disabled" />
                </UFormField>
                <UButton :icon="file ? 'i-lucide-check' : 'i-lucide-upload'" variant="soft" :disabled="disabled" @click="pick()">
                  {{ file?.name ?? '选择单张图片(png/jpg/webp)' }}
                </UButton>
              </div>
            </template>
            <template v-else-if="isUploadZip">
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
            <template v-else-if="isDownloadSingle">
              <p class="text-xs text-muted">
                将按系列、语言和编号从所选来源下载卡图,面序号按卡牌正反面自动判断。
              </p>
            </template>
            <input ref="fileInput" type="file" class="hidden" accept=".png,.jpg,.jpeg,.webp" @change="onFilePicked">
          </div>
        </template>
      </TaskController>

      <TaskResultCard :result="countResult" :labels="RESULT_LABELS" />

      <div v-if="listResults.length > 0" class="rounded-xl border border-slate-200 bg-white p-4">
        <div v-for="group in listResults" :key="group.label" class="py-1 text-sm">
          <span class="font-medium">{{ group.label }}({{ group.items.length }}):</span>
          <span class="font-mono text-xs text-muted">{{ group.items.join('、') }}</span>
        </div>
      </div>

      <ImageCompareCard :set="form.set" :lang="form.lang" :number="form.number" />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { TaskPageSnapshot } from '@tcg-cards/model/task';
import { locale, mainLocale } from '@tcg-cards/model/magic/schema/basic';
import { open } from '@tauri-apps/plugin-dialog';
import type { TaskOperation } from '~/components/task/TaskController.vue';
import ImageCompareCard from '~/components/magic/ImageCompareCard.vue';
import { orpc } from '~/lib/orpc';

definePageMeta({ layout: 'admin', title: '卡图导入' });

const SOURCE_OPTIONS = [
  { label: '手动上传', value: 'manual' },
  { label: 'MTGCH', value: 'mtgch' },
  { label: 'MTGFlame', value: 'mtgflame' },
  { label: 'Hunterer', value: 'hunterer' },
  { type: 'separator' },
  { label: 'Scryfall', value: 'scryfall' },
  { label: 'Gatherer', value: 'gatherer' },
] as const;

/** Result-key → report label for the unified import output. */
const RESULT_LABELS: Record<string, string> = {
  processed:         '处理数',
  written:           '写入',
  unchanged:         '未变化',
  failed:            '失败',
  skipped:           '已跳过',
  lowQuality:        '低清',
  cleanedJpg:        '清理 JPG',
  missingUrl:        '缺少图片地址',
  missingId:         '缺少 Gatherer 编号',
  placeholder:       '占位图',
  skippedUpload:     '跳过上传图',
  unmatched:         '未匹配编号',
  unrecognized:      '未识别文件',
};

const LIST_LABELS: Record<string, string> = {
  unmatchedNumbers:  '未匹配编号',
  unrecognizedNames: '未识别文件',
  warnings:          '名称提示',
};

const CONVENTION_LABELS: Record<string, string> = {
  face:  '编号-面',
  named: '编号-名称',
  plain: '纯编号',
  tree:  '目录结构',
};

/** Sources that accept local uploads; remote ones download instead. */
const uploadSources = ['manual', 'mtgch', 'mtgflame', 'hunterer'];

const form = useLocalPersist('magic-image-import', {
  source:     'manual',
  remoteMode: 'batch',
  uploadMode: 'single',
  set:        '',
  lang:       '',
  force:      false,
  cleanupJpg: false,
  number:     '',
  faceIndex:  '',
  zipPath:    '',
  fileName:   '',
  dataBase64: '',
}, ['source', 'remoteMode', 'uploadMode', 'set', 'lang', 'force', 'cleanupJpg', 'number', 'faceIndex', 'zipPath']);

const isRemote = computed(() => !uploadSources.includes(form.source));
const isRemoteBatch = computed(() => isRemote.value && form.remoteMode === 'batch');
const isDownloadSingle = computed(() => isRemote.value && form.remoteMode === 'number');
const isUploadSingle = computed(() => !isRemote.value && form.uploadMode === 'single');
const isUploadZip = computed(() => !isRemote.value && form.uploadMode === 'zip');
const isSingle = computed(() => isDownloadSingle.value || isUploadSingle.value);
const treeMode = computed(() => isUploadZip.value && analysis.value?.convention === 'tree');

/** The mode select of the second form field, driven by the source group. */
const remoteOrUploadMode = computed({
  get: () => isRemote.value ? form.remoteMode : form.uploadMode,
  set: (value: string) => {
    if (isRemote.value) form.remoteMode = value;
    else form.uploadMode = value;
  },
});

const modeOptions = computed(() => {
  if (isRemote.value) return [{ label: '批量导入', value: 'batch' }, { label: '按编号', value: 'number' }];
  return [{ label: '单张图片', value: 'single' }, { label: '压缩包', value: 'zip' }];
});

watch(() => form.source, () => {
  // Remote batch keeps a set; switching groups resets to the group's default mode.
  if (isRemote.value && !['batch', 'number'].includes(form.remoteMode)) form.remoteMode = 'batch';
  if (!isRemote.value && !['single', 'zip'].includes(form.uploadMode)) form.uploadMode = 'single';
  // The no-language sentinel only exists in the remote batch form.
  if (isRemote.value && form.lang === '') form.lang = ALL_LANGUAGES;
  if (!isRemote.value && form.lang === ALL_LANGUAGES) form.lang = '';
});

const setRequired = computed(() => !(isRemoteBatch.value && form.source === 'scryfall' && form.set === '__all__'));
const langRequired = computed(() => !isRemoteBatch.value);

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
    const result = await orpc.magic.analyze.imageArchive({ zipPath: form.zipPath.trim() }) as ZipAnalysis;
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
const ALL_LANGUAGES = '__all__';
const ALL_SETS = '__all__';

const langItems = computed(() => {
  const locales = [
    ...mainLocale.options.map(code => ({ label: code.toUpperCase(), value: code })),
    { type: 'separator' },
    ...locale.options.filter(code => !mainCodeSet.has(code)).map(code => ({ label: code.toUpperCase(), value: code })),
  ];
  return isRemoteBatch.value
    ? [{ label: '不限', value: ALL_LANGUAGES }, ...locales]
    : locales;
});

const setItems = computed(() => {
  const sets = setOptions.value.map(code => ({ label: code, value: code }));
  return isRemoteBatch.value && form.source === 'scryfall'
    ? [{ label: '不限(全量)', value: ALL_SETS }, ...sets]
    : sets;
});

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
  const setChosen = form.set.trim() !== '' && form.set !== ALL_SETS;
  const langChosen = form.lang.trim() !== '' && form.lang !== ALL_LANGUAGES;
  let ready: boolean;
  if (isRemoteBatch.value) {
    ready = form.source === 'scryfall' ? (form.set === ALL_SETS || setChosen) : setChosen;
  } else if (isDownloadSingle.value) {
    ready = setChosen && langChosen && !!form.number.trim();
  } else if (isUploadSingle.value) {
    ready = setChosen && langChosen && !!form.number.trim() && !!form.dataBase64;
  } else {
    ready = treeMode.value ? !!form.zipPath.trim() : setChosen && langChosen && !!form.zipPath.trim();
  }

  return {
    key:      'import',
    label:    '开始导入',
    icon:     'i-lucide-play',
    disabled: !ready,
    create:   async () => {
      const common = { force: !!form.force, cleanupJpg: !!form.cleanupJpg };
      if (isRemoteBatch.value) {
        return orpc.magic.createTask.imageImportRemote({
          source: form.source as 'scryfall' | 'gatherer',
          scope:  form.set === ALL_SETS ? 'full' : 'set',
          set:    form.set === ALL_SETS ? undefined : form.set,
          lang:   form.lang === ALL_LANGUAGES ? undefined : form.lang,
          ...common,
        }) as Promise<TaskPageSnapshot>;
      }
      if (isUploadZip.value) {
        return orpc.magic.createTask.imageImportLocal({
          source: form.source as 'manual' | 'mtgch' | 'mtgflame' | 'hunterer',
          set:    treeMode.value ? undefined : form.set,
          lang:   treeMode.value ? undefined : form.lang,
          zipPath: form.zipPath.trim(),
          ...common,
        }) as Promise<TaskPageSnapshot>;
      }
      return orpc.magic.createTask.imageImportSingle({
        source: form.source as 'manual' | 'mtgch' | 'mtgflame' | 'hunterer' | 'scryfall' | 'gatherer',
        set:    form.set,
        lang:   form.lang,
        number: form.number.trim(),
        faceIndex: isUploadSingle.value && form.faceIndex.trim() ? Number(form.faceIndex) : undefined,
        fileName: isUploadSingle.value ? form.fileName || undefined : undefined,
        dataBase64: isUploadSingle.value ? form.dataBase64 : undefined,
        ...common,
      }) as Promise<TaskPageSnapshot>;
    },
  };
});
</script>
