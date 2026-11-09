<template>
  <div class="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
    <span class="flex items-center gap-1.5 text-xs" :class="error ? 'text-error' : 'text-slate-500'">
      <UIcon v-if="streaming" name="i-lucide-loader-circle" class="size-3.5 animate-spin" />
      {{ statusText }}
    </span>
    <div class="flex items-center gap-1">
      <UButton v-if="streaming" label="停止" size="xs" color="neutral" variant="ghost" @click="cancel" />
      <UButton icon="i-lucide-x" aria-label="关闭解析" size="xs" color="neutral" variant="ghost" @click="close" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { DefaultChatTransport } from 'ai';
import { useChat } from '@ai-sdk/vue';
import { aiAnnouncementResult, type AiAnnouncementResult } from '@tcg-cards/model/magic/schema/announcement-ai';

const props = defineProps<{ name?: string, url: string, requestKey: number }>();
const emit = defineEmits<{
  result: [result: AiAnnouncementResult, requestKey: number];
  close:  [];
}>();
const phase = ref('fetch');
const completed = ref(false);
const cancelled = ref(false);
const invalid = ref(false);
const requestKey = props.requestKey;

const { status, error, sendMessage, stop } = useChat({
  transport: new DefaultChatTransport({
    api:  'http://localhost:4318/ai/magic/parse/stream',
    body: { name: props.name, links: [{ url: props.url }] },
  }),
  onData: part => {
    if (cancelled.value || completed.value) return;
    if (part.type === 'data-phase') {
      const data = part.data as { phase?: string };
      phase.value = data.phase ?? phase.value;
    }
    if (part.type === 'data-result') {
      const parsed = aiAnnouncementResult.safeParse(part.data);
      if (!parsed.success) {
        invalid.value = true;
        return;
      }
      completed.value = true;
      emit('result', parsed.data, requestKey);
    }
  },
});

const streaming = computed(() => !cancelled.value && ['submitted', 'generating', 'streaming'].includes(status.value));
const statusText = computed(() => {
  if (cancelled.value) return '解析已停止';
  if (error.value || invalid.value) return '解析失败，请检查链接与 AI 设置后重试。';
  if (completed.value) return '解析完成';
  return phase.value === 'fetch' ? '正在获取公告页面…' : '正在分析公告…';
});

/** Cancels the request before any late stream events can update the form. */
function cancel(): void {
  cancelled.value = true;
  void stop();
}

/** Stops the active request and dismisses the result panel. */
function close(): void {
  cancel();
  emit('close');
}

watch(status, value => {
  if (value === 'ready' && !completed.value && !cancelled.value) invalid.value = true;
});
onMounted(() => {
  void sendMessage({ text: '解析公告' });
});
onBeforeUnmount(cancel);
</script>
