<template>
  <UModal
    v-model:open="open"
    :title="title"
    description="比较同一印张的 Scryfall 与 Gatherer 卡图质量,不写入图库"
    :ui="{ content: 'sm:max-w-[1600px]', body: 'overflow-x-auto' }"
  >
    <template #body>
      <div class="space-y-3">
        <UAlert
          v-if="!ready"
          color="neutral"
          variant="soft"
          icon="i-lucide-info"
          description="请先在质量报告里选择一个印张。"
        />
        <UAlert
          v-else-if="error"
          color="error"
          variant="soft"
          icon="i-lucide-circle-alert"
          :description="error"
        />
        <div v-if="comparing" class="flex items-center gap-2 text-sm text-muted">
          <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
          正在比对…
        </div>

        <div
          v-for="face in result?.faces ?? []"
          :key="face.faceIndex"
          class="space-y-2 rounded-lg border border-slate-200 p-3"
        >
          <div class="text-sm font-medium">
            {{ face.faceIndex === 0 ? '正面' : face.faceIndex === 1 ? '背面' : `面 ${face.faceIndex}` }}
            <UBadge
              :label="verdictLabel(face.verdict)"
              :color="verdictColor(face.verdict)"
              variant="soft"
              class="ml-2"
            />
          </div>
          <div class="grid gap-3 sm:grid-cols-2">
            <CompareSidePanel :side="face.scryfall" title="Scryfall" />
            <CompareSidePanel :side="face.gatherer" title="Gatherer" />
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { orpc } from '~/lib/orpc';
import CompareSidePanel from '~/components/magic/CompareSidePanel.vue';

interface CompareSide {
  status:        'ok' | 'unavailable';
  source:        'scryfall' | 'gatherer';
  reason?:       string;
  width?:        number;
  height?:       number;
  byteSize?:     number;
  qualityScore?: number | null;
  tier?:         string;
  preview?:      string;
}

interface CompareFace {
  faceIndex: number;
  scryfall:  CompareSide;
  gatherer:  CompareSide;
  verdict:   'scryfall' | 'gatherer' | 'equal' | 'inconclusive';
}

const props = defineProps<{
  set:    string;
  lang:   string;
  number: string;
}>();

/** Open state of the compare modal; a status-grid cell pick opens it. */
const open = defineModel<boolean>('open', { default: false });

const comparing = ref(false);
const error = ref('');
const result = ref<{ faces: CompareFace[] } | null>(null);

const ready = computed(() => !!props.set.trim() && !!props.lang.trim() && !!props.number.trim());

/** Modal title carries the compared print, e.g. `来源质量比对 · dmu / 123a / zhs`. */
const title = computed(() => (ready.value ? `来源质量比对 · ${props.set} / ${props.number} / ${props.lang}` : '来源质量比对'));

watch(ready, value => {
  if (!value) {
    result.value = null;
    error.value = '';
  }
});

// The modal has no trigger button: opening it — or retargeting it while open —
// runs the comparison for the current print right away.
watch([open, () => [props.set, props.lang, props.number]], ([isOpen]) => {
  if (isOpen && ready.value) void runCompare();
});

async function runCompare() {
  comparing.value = true;
  error.value = '';
  result.value = null;
  try {
    result.value = await orpc.magic.images.compare({
      set:    props.set.trim(),
      lang:   props.lang.trim(),
      number: props.number.trim(),
    });
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
    result.value = null;
  } finally {
    comparing.value = false;
  }
}

function verdictLabel(verdict: CompareFace['verdict']): string {
  switch (verdict) {
  case 'scryfall': return 'Scryfall 更清晰';
  case 'gatherer': return 'Gatherer 更清晰';
  case 'equal': return '两者相当';
  default: return '无法判定';
  }
}

function verdictColor(verdict: CompareFace['verdict']): 'primary' | 'neutral' | 'warning' {
  switch (verdict) {
  case 'scryfall':
  case 'gatherer': return 'primary';
  case 'equal': return 'neutral';
  default: return 'warning';
  }
}
</script>
