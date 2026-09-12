<template>
  <div class="overflow-hidden rounded-lg border border-slate-200 bg-white">
    <div class="flex items-center justify-between border-b border-slate-200 px-3 py-2">
      <span class="flex items-center gap-1.5 text-xs text-slate-500">
        <UIcon v-if="streaming" name="i-lucide-loader-circle" class="size-3.5 animate-spin" />
        {{ statusText }}
      </span>
      <div class="flex items-center gap-1">
        <UButton v-if="streaming" icon="i-lucide-square" label="停止" size="xs" color="neutral" variant="ghost" @click="stop()" />
        <UButton icon="i-lucide-x" size="xs" color="neutral" variant="ghost" @click="emit('close')" />
      </div>
    </div>
    <UChatPalette class="h-72">
      <UChatMessages :messages="messages" :status="status" should-auto-scroll>
        <template #content="{ message }">
          <template v-for="(part, index) in message.parts" :key="`${message.id}-${part.type}-${index}`">
            <div v-if="isToolUIPart(part)" class="my-1 flex items-center gap-1.5 rounded-md bg-primary-50 px-2 py-1 text-xs text-primary-700">
              <UIcon name="i-lucide-wrench" class="size-3" />
              <span>{{ toolLabels[getToolName(part)] ?? getToolName(part) }}</span>
            </div>
            <p v-else-if="isTextUIPart(part) && part.text && message.role === 'user'" class="text-xs text-slate-400">{{ part.text }}</p>
            <pre v-else-if="isTextUIPart(part) && part.text" class="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-2 font-mono text-xs text-slate-700">{{ part.text }}</pre>
          </template>
        </template>
      </UChatMessages>
    </UChatPalette>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { DefaultChatTransport, getToolName, isTextUIPart, isToolUIPart } from 'ai';
import { useChat } from '@ai-sdk/vue';

const props = defineProps<{
  name?: string;
  link:  { url: string, label?: string };
}>();

const emit = defineEmits<{
  result:  [payload: { header: unknown, items: unknown[] }];
  settled: [];
  close:   [];
}>();

let resultEmitted = false;
const phase = ref('fetch');

// Destructured so the refs are top-level in setup: the AI SDK updates `messages`
// via `triggerRef` (in-place mutation), which re-runs the render effect only when
// the ref is used directly. Wrapping it in a computed would freeze streaming text.
const { messages, status, error, sendMessage, stop } = useChat({
  transport: new DefaultChatTransport({
    api:  'http://localhost:4318/ai/parse/stream',
    body: { name: props.name, links: [{ url: props.link.url, label: props.link.label }] },
  }),
  // Every custom `data-*` event from the server lands here. The `data-phase`
  // events drive the live status line; the `data-result` event carries the
  // parsed header/items and is only delivered once.
  onData: dataPart => {
    if (dataPart.type === 'data-phase') {
      phase.value = (dataPart.data as { phase?: string } | undefined)?.phase ?? phase.value;
    } else if (dataPart.type === 'data-result' && !resultEmitted) {
      resultEmitted = true;
      emit('result', dataPart.data as { header: unknown, items: unknown[] });
      emit('settled');
    }
  },
});

const streaming = computed(() => ['submitted', 'generating', 'streaming'].includes(status.value));

const statusText = computed(() => {
  if (status.value === 'error') return '解析失败';
  if (resultEmitted) return '解析完成';
  if (streaming.value) return phaseLabel(phase.value);
  return '准备中…';
});

onMounted(() => {
  sendMessage({ text: '用 AI 解析公告' });
});

const toolLabels: Record<string, string> = {
  searchCards:   '正在查询卡牌…',
  lookupPatches: '正在匹配版本…',
};

const phaseLabels: Record<string, string> = {
  fetch:   '正在获取公告页面…',
  analyze: 'AI 分析中…',
};

function phaseLabel(value: string): string {
  return phaseLabels[value] ?? value;
}

// Errors surface through chat.error; let the parent clear loading.
watch(() => error.value, value => {
  if (value) emit('settled');
});
</script>
