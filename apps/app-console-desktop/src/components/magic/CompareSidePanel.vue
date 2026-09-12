<template>
  <div class="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
    <div class="flex items-center gap-2 text-sm font-medium">
      {{ title }}
      <UBadge
        v-if="side.status === 'unavailable'"
        label="不可用"
        color="warning"
        variant="soft"
      />
    </div>

    <template v-if="side.status === 'ok'">
      <img
        :src="side.preview"
        :alt="title"
        class="max-h-64 w-auto rounded border border-slate-200 bg-white"
      >
      <dl class="space-y-1 text-xs text-muted">
        <div class="flex justify-between gap-2">
          <dt>尺寸</dt>
          <dd class="font-mono text-default">{{ side.width }}×{{ side.height }}</dd>
        </div>
        <div class="flex justify-between gap-2">
          <dt>字节数</dt>
          <dd class="font-mono text-default">{{ formatBytes(side.byteSize) }}</dd>
        </div>
        <div class="flex justify-between gap-2">
          <dt>细节损失率</dt>
          <dd class="font-mono text-default">{{ side.qualityScore == null ? '—' : side.qualityScore.toFixed(3) }}</dd>
        </div>
        <div class="flex justify-between gap-2">
          <dt>判档</dt>
          <dd>
            <UBadge
              :label="side.tier === 'highres_scan' ? '高清' : '低清'"
              :color="side.tier === 'highres_scan' ? 'success' : 'warning'"
              variant="soft"
            />
          </dd>
        </div>
      </dl>
    </template>
    <template v-else>
      <div class="flex h-40 items-center justify-center rounded border border-dashed border-slate-300 text-sm text-muted">
        {{ side.reason ?? '该来源不可用' }}
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title: string;
  side:  {
    status:     'ok' | 'unavailable';
    source:     'scryfall' | 'gatherer';
    reason?:    string;
    width?:     number;
    height?:    number;
    byteSize?:  number;
    qualityScore?: number | null;
    tier?:      string;
    preview?:   string;
  };
}>();

function formatBytes(size: number | undefined): string {
  if (size == null) return '—';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}
</script>
