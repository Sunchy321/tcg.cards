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
          <UButton
            label="图片质量检查"
            icon="i-lucide-search-check"
            color="info"
            variant="soft"
            :disabled="!qualityReady"
            :loading="checkingQuality"
            @click="runQualityCheck"
          />
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
                <div class="flex items-center gap-2">
                  <UFieldGroup>
                    <UButton
                      v-for="s in uploadSources"
                      :key="s"
                      :label="SOURCE_LABELS[s]"
                      :color="form.source === s ? 'primary' : 'neutral'"
                      :variant="form.source === s ? 'solid' : 'soft'"
                      :disabled="disabled"
                      @click="{ form.source = s; }"
                    />
                  </UFieldGroup>
                  <span class="h-5 w-px bg-slate-200" aria-hidden="true" />
                  <UFieldGroup>
                    <UButton
                      v-for="s in remoteSources"
                      :key="s"
                      :label="SOURCE_LABELS[s]"
                      :color="form.source === s ? 'primary' : 'neutral'"
                      :variant="form.source === s ? 'solid' : 'soft'"
                      :disabled="disabled"
                      @click="{ form.source = s; }"
                    />
                  </UFieldGroup>
                </div>
              </UFormField>
              <UFormField v-if="!isRemote" orientation="horizontal" :ui="{ root: '!justify-start' }" label="导入方式" required>
                <USelect
                  v-model="form.uploadMode"
                  :items="UPLOAD_MODE_OPTIONS"
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
              <UFormField orientation="horizontal" :ui="{ root: '!justify-start' }" label="编号" :required="isSingle" class="min-w-40">
                <UInput
                  v-model="form.number"
                  :placeholder="isDownloadSingle ? '如 123、1-19、1,3,5' : '如 123'"
                  autocomplete="off"
                  spellcheck="false"
                  :disabled="disabled || !isSingle"
                />
              </UFormField>
              <UCheckbox
                v-if="isRemote"
                v-model="allScope"
                label="全部"
                :disabled="disabled"
              />
            </div>

            <UFormField orientation="horizontal" :ui="{ root: '!justify-start' }" label="语言" :required="!treeMode">
              <div class="flex flex-wrap items-center gap-1">
                <UFieldGroup>
                  <UButton
                    v-for="code in mainLocales"
                    :key="code"
                    :label="code.toUpperCase()"
                    size="sm"
                    :color="form.langs.includes(code) ? 'primary' : 'neutral'"
                    :variant="form.langs.includes(code) ? 'solid' : 'soft'"
                    :disabled="disabled || treeMode"
                    @click="toggleLang(code)"
                  />
                </UFieldGroup>
                <span class="h-5 w-px bg-slate-200" aria-hidden="true" />
                <UFieldGroup>
                  <UButton
                    v-for="code in secondaryLocales"
                    :key="code"
                    :label="code.toUpperCase()"
                    size="sm"
                    :color="form.langs.includes(code) ? 'primary' : 'neutral'"
                    :variant="form.langs.includes(code) ? 'solid' : 'soft'"
                    :disabled="disabled || treeMode"
                    @click="toggleLang(code)"
                  />
                </UFieldGroup>
                <UCheckbox
                  class="ml-2"
                  :model-value="langAllSelected ? true : langSomeSelected ? 'indeterminate' : false"
                  label="全选"
                  :disabled="disabled || treeMode"
                  @update:model-value="toggleAllLangs"
                />
              </div>
            </UFormField>

            <template v-if="isUploadSingle">
              <div class="flex flex-wrap items-center gap-x-6 gap-y-3">
                <UFormField orientation="horizontal" :ui="{ root: '!justify-start' }" label="面序号(可选)">
                  <UInput v-model="form.faceIndex" placeholder="留空=单面,多面填 0/1" class="w-44" :disabled="disabled" />
                </UFormField>
                <UButton :icon="file ? 'i-lucide-check' : 'i-lucide-upload'" variant="soft" :disabled="disabled" @click="pick()">
                  {{ file?.name ?? '选择单张图片(png/jpg/webp)' }}
                </UButton>
              </div>
              <p v-if="numbers.length > 1" class="text-sm text-error">
                上传单张只能填一个编号。
              </p>
              <p v-else-if="form.langs.length > 1" class="text-sm text-error">
                上传单张只能选一个语言。
              </p>
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
              <p v-if="!treeMode && form.langs.length > 1" class="text-sm text-error">
                压缩包导入一次只能选一个语言。
              </p>
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
                      :variant="form.set === candidate.set && form.langs.length === 1 && form.langs[0] === candidate.lang ? 'solid' : 'soft'"
                      size="xs"
                      :disabled="disabled"
                      @click="applyCandidate(candidate)"
                    >
                      {{ candidate.set }} / {{ candidate.lang }} · {{ Math.round(candidate.rate * 100) }}%
                    </UButton>
                  </template>
                </div>
              </div>
            </template>
            <template v-else-if="isDownloadSingle">
              <p v-if="numbers.length > 1" class="text-xs text-muted">
                本次将处理 <span class="font-mono">{{ numbers.length }}</span> 个编号。
              </p>
            </template>
            <input ref="fileInput" type="file" class="hidden" accept=".png,.jpg,.jpeg,.webp" @change="onFilePicked">
          </div>
        </template>
      </TaskController>

      <ImageQualityReport
        :report="qualityReport"
        :error="qualityError"
        @close="clearQualityCheck"
      />

      <TaskResultCard :result="countResult" :labels="RESULT_LABELS" />

      <ImportResultLists :groups="listGroups" />

      <ImageCompareCard :set="form.set" :lang="compareLang" :number="compareNumber" />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { TaskPageSnapshot } from '@tcg-cards/model/task';
import { locale, mainLocale } from '@tcg-cards/model/magic/schema/basic';
import { open } from '@tauri-apps/plugin-dialog';
import type { TaskOperation } from '~/components/task/TaskController.vue';
import ImageCompareCard from '~/components/magic/ImageCompareCard.vue';
import ImageQualityReport from '~/components/magic/ImageQualityReport.vue';
import ImportResultLists from '~/components/magic/ImportResultLists.vue';
import { orpc } from '~/lib/orpc';
import { parseNumberInput } from '~/utils/import-numbers';

definePageMeta({ layout: 'admin', title: '卡图导入' });

const SOURCE_LABELS = {
  manual:   '手动上传',
  mtgch:    'MTGCH',
  mtgflame: 'MTGFlame',
  hunterer: 'Hunterer',
  scryfall: 'Scryfall',
  gatherer: 'Gatherer',
} as const;

type SourceKey = keyof typeof SOURCE_LABELS;

const UPLOAD_MODE_OPTIONS = [
  { label: '单张图片', value: 'single' },
  { label: '压缩包', value: 'zip' },
] as const;

/** Result-key → report label for the unified import output. */
const RESULT_LABELS: Record<string, string> = {
  processed:     '处理数',
  written:       '写入',
  unchanged:     '未变化',
  failed:        '失败',
  skipped:       '已跳过',
  lowQuality:    '低清',
  cleanedJpg:    '清理 JPG',
  missingUrl:    '缺少图片地址',
  missingId:     '缺少 Gatherer 编号',
  placeholder:   '占位图',
  skippedUpload: '跳过上传图',
  unmatched:     '未匹配编号',
  unrecognized:  '未识别文件',
};

const LIST_LABELS: Record<string, string> = {
  unmatchedNumbers:  '未匹配编号',
  unrecognizedNames: '未识别文件',
  warnings:          '名称提示',
  failures:          '失败明细',
};

const CONVENTION_LABELS: Record<string, string> = {
  face:  '编号-面',
  named: '编号-名称',
  plain: '纯编号',
  tree:  '目录结构',
};

/** Sources that accept local uploads; remote ones download instead. */
const uploadSources: SourceKey[] = ['manual', 'mtgch', 'mtgflame', 'hunterer'];
/** Download-over-HTTP sources, rendered as the second button group. */
const remoteSources: SourceKey[] = ['scryfall', 'gatherer'];

const form = useLocalPersist('magic-image-import', {
  source:     'manual' as SourceKey,
  remoteMode: 'batch',
  uploadMode: 'single',
  set:        '',
  langs:      ['en'],
  force:      false,
  cleanupJpg: false,
  number:     '',
  faceIndex:  '',
  zipPath:    '',
  fileName:   '',
  dataBase64: '',
}, ['source', 'remoteMode', 'uploadMode', 'set', 'langs', 'force', 'cleanupJpg', 'number', 'faceIndex', 'zipPath']);

const isRemote = computed(() => !uploadSources.includes(form.source));
const isRemoteBatch = computed(() => isRemote.value && form.remoteMode === 'batch');
const isDownloadSingle = computed(() => isRemote.value && form.remoteMode === 'number');
const isUploadSingle = computed(() => !isRemote.value && form.uploadMode === 'single');
const isUploadZip = computed(() => !isRemote.value && form.uploadMode === 'zip');
const isSingle = computed(() => isDownloadSingle.value || isUploadSingle.value);
const treeMode = computed(() => isUploadZip.value && analysis.value?.convention === 'tree');

/** Every collector number the 编号 field stands for; a comma list or a range holds more than one. */
const numbers = computed(() => parseNumberInput(form.number));
/** The comparison always works on the first number the 编号 field selects — of a list or of a range alike. */
const compareNumber = computed(() => numbers.value[0] ?? '');
/** The comparison works on the first selected language, falling back to English. */
const compareLang = computed(() => selectedLangs.value[0] ?? 'en');

/** 全部 checked = sweep the remote source as a batch, unchecked = import by number. */
const allScope = computed({
  get: () => form.remoteMode === 'batch',
  set: (value: boolean) => {
    form.remoteMode = value ? 'batch' : 'number';
  },
});

watch(() => form.source, () => {
  // Switching source groups resets to the group's default mode.
  if (isRemote.value && !['batch', 'number'].includes(form.remoteMode)) form.remoteMode = 'batch';
  if (!isRemote.value && !['single', 'zip'].includes(form.uploadMode)) form.uploadMode = 'single';
});

const setRequired = computed(() => !(isRemoteBatch.value && form.source === 'scryfall' && form.set === '__all__'));

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
      form.langs = [top.lang];
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
      multiple:  false,
      directory: false,
      filters:   [{ name: 'Zip', extensions: ['zip'] }],
    });
    if (typeof picked === 'string') form.zipPath = picked;
  } catch {
    // Outside the desktop shell the dialog is unavailable; keep typing the path manually.
  }
}

function applyCandidate(candidate: ZipCandidate) {
  form.set = candidate.set;
  form.langs = [candidate.lang];
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

const ALL_SETS = '__all__';

/** Locales in group order: main locales first, then the remaining secondary ones. */
const mainLocales: string[] = [...mainLocale.options];
const secondaryLocales: string[] = locale.options.filter(code => !(mainLocale.options as readonly string[]).includes(code));
const allLocales: string[] = [...mainLocales, ...secondaryLocales];

/** Selected languages normalized to group order; drives the import scope and the comparison. */
const selectedLangs = computed(() => allLocales.filter(code => form.langs.includes(code)));

const langAllSelected = computed(() => selectedLangs.value.length === allLocales.length);
const langSomeSelected = computed(() => selectedLangs.value.length > 0 && !langAllSelected.value);

function toggleLang(code: string) {
  form.langs = form.langs.includes(code)
    ? form.langs.filter(candidate => candidate !== code)
    : [...form.langs, code];
}

function toggleAllLangs() {
  form.langs = langAllSelected.value ? [] : [...allLocales];
}

const setItems = computed(() => {
  const sets = setOptions.value.map(code => ({ label: code, value: code }));
  return isRemoteBatch.value && form.source === 'scryfall'
    ? [{ label: '不限(全量)', value: ALL_SETS }, ...sets]
    : sets;
});

/** The quality check runs on one whole set across all languages, so it needs a concrete set. */
const qualityReady = computed(() => form.set.trim() !== '' && form.set !== ALL_SETS);

const checkingQuality = ref(false);
const qualityReport = ref<Awaited<ReturnType<typeof orpc.magic.images.qualityCheck>> | null>(null);
const qualityError = ref('');

function clearQualityCheck() {
  qualityReport.value = null;
  qualityError.value = '';
}

// A report belongs to the set it was produced from; switching sets would only mislead.
watch(() => form.set, () => clearQualityCheck());

async function runQualityCheck() {
  const set = form.set.trim();
  if (!set || set === ALL_SETS) return;
  checkingQuality.value = true;
  qualityError.value = '';
  try {
    qualityReport.value = await orpc.magic.images.qualityCheck({ set });
  } catch (error) {
    qualityReport.value = null;
    qualityError.value = error instanceof Error ? error.message : String(error);
  } finally {
    checkingQuality.value = false;
  }
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

/** Failures first — the list the reader came for — then the remaining lists in report order. */
const listGroups = computed(() => {
  const failures = listResults.value.filter(group => group.label === LIST_LABELS.failures);
  const rest = listResults.value.filter(group => group.label !== LIST_LABELS.failures);
  return [...failures, ...rest];
});

const operation = computed<TaskOperation>(() => {
  const setChosen = form.set.trim() !== '' && form.set !== ALL_SETS;
  const hasLang = selectedLangs.value.length > 0;
  let ready: boolean;
  if (isRemoteBatch.value) {
    ready = hasLang && (form.source === 'scryfall' ? (form.set === ALL_SETS || setChosen) : setChosen);
  } else if (isDownloadSingle.value) {
    ready = setChosen && hasLang && numbers.value.length > 0;
  } else if (isUploadSingle.value) {
    // One uploaded file belongs to exactly one print in one language, so a
    // number list or a second language blocks the run.
    ready = setChosen && selectedLangs.value.length === 1 && numbers.value.length === 1 && !!form.dataBase64;
  } else {
    // A flat archive carries one language, so exactly one must be selected.
    ready = treeMode.value ? !!form.zipPath.trim() : setChosen && selectedLangs.value.length === 1 && !!form.zipPath.trim();
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
          langs:  selectedLangs.value,
          ...common,
        }) as Promise<TaskPageSnapshot>;
      }
      if (isUploadZip.value) {
        return orpc.magic.createTask.imageImportLocal({
          source:  form.source as 'manual' | 'mtgch' | 'mtgflame' | 'hunterer',
          set:     treeMode.value ? undefined : form.set,
          lang:    treeMode.value ? undefined : form.langs[0],
          zipPath: form.zipPath.trim(),
          ...common,
        }) as Promise<TaskPageSnapshot>;
      }
      return orpc.magic.createTask.imageImportSingle({
        source:     form.source as 'manual' | 'mtgch' | 'mtgflame' | 'hunterer' | 'scryfall' | 'gatherer',
        set:        form.set,
        langs:      selectedLangs.value,
        numbers:    numbers.value,
        faceIndex:  isUploadSingle.value && form.faceIndex.trim() ? Number(form.faceIndex) : undefined,
        fileName:   isUploadSingle.value ? form.fileName || undefined : undefined,
        dataBase64: isUploadSingle.value ? form.dataBase64 : undefined,
        ...common,
      }) as Promise<TaskPageSnapshot>;
    },
  };
});
</script>
