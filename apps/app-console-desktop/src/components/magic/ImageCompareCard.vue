<template>
  <div class="rounded-xl border border-slate-200 bg-white">
    <button
      type="button"
      class="flex w-full items-center gap-2 p-4 text-left"
      @click="open = !open"
    >
      <UIcon
        name="i-lucide-chevron-down"
        class="size-4 text-muted transition-transform"
        :class="{ 'rotate-90': open }"
      />
      <UIcon name="i-lucide-image-minus" class="size-4 text-primary" />
      <span class="font-medium">来源质量比对</span>
      <span class="text-xs text-muted">比较同一印张的 Scryfall 与 Gatherer 卡图质量,不写入图库</span>
      <UIcon
        v-if="comparing"
        name="i-lucide-loader-circle"
        class="ml-auto size-4 animate-spin text-muted"
      />
    </button>

    <div v-show="open" class="space-y-3 border-t border-slate-200 p-4">
      <UAlert
        v-if="!ready"
        color="neutral"
        variant="soft"
        icon="i-lucide-info"
        description="请先在上方选择单条形态,并填写系列、语言与编号。"
      />
      <UAlert
        v-else-if="error"
        color="error"
        variant="soft"
        icon="i-lucide-circle-alert"
        :description="error"
      />
      <template v-if="ready">
        <div class="flex items-center gap-3">
          <span class="text-sm text-muted">
            印张:<span class="font-mono text-default">{{ set }} / {{ lang }} / {{ number }}</span>
          </span>
          <UButton
            class="ml-auto"
            label="开始比对"
            icon="i-lucide-scale"
            :loading="comparing"
            :disabled="comparing"
            @click="runCompare"
          />
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
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { orpc } from '~/lib/orpc';
import CompareSidePanel from '~/components/magic/CompareSidePanel.vue';

interface CompareSide {
  status:     'ok' | 'unavailable';
  source:     'scryfall' | 'gatherer';
  reason?:    string;
  width?:     number;
  height?:    number;
  byteSize?:  number;
  qualityScore?: number | null;
  tier?:      string;
  preview?:   string;
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

const open = ref(false);
const comparing = ref(false);
const error = ref('');
const result = ref<{ faces: CompareFace[] } | null>(null);

const ready = computed(() => !!props.set.trim() && !!props.lang.trim() && !!props.number.trim());

watch(ready, value => {
  if (!value) {
    result.value = null;
    error.value = '';
  }
});

async function runCompare() {
  comparing.value = true;
  error.value = '';
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
