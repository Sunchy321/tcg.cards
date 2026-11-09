<template>
  <div class="flex items-center gap-3 text-xs">
    <template v-if="selected">
      <template v-if="gameLabel">
        <span class="text-muted">{{ gameLabel }}</span>
        <span class="text-muted">·</span>
      </template>
      <UDropdownMenu
        v-if="targetItems.length > 1"
        :items="targetItems"
        :content="{ align: 'end' }"
      >
        <button type="button" :disabled="disabled" class="inline-flex items-center gap-1 text-muted transition-colors hover:text-default disabled:cursor-not-allowed">
          {{ selected.name }}
          <UIcon name="i-lucide-chevron-down" class="size-3 opacity-70" />
        </button>
      </UDropdownMenu>
      <span v-else class="text-muted">{{ selected.name }}</span>
      <UBadge :label="shortFingerprint(selected.fingerprint)" color="neutral" variant="soft" size="xs" />
    </template>
    <span v-else class="text-muted">未配置</span>
    <UButton icon="i-lucide-refresh-cw" color="neutral" variant="ghost" size="xs" :disabled="disabled" @click="emit('reload')" />
  </div>
</template>

<script setup lang="ts">
import type { PublishTargetOption } from '~/composables/usePublishTargetSelection';

const props = defineProps<{
  targets:    PublishTargetOption[];
  selected:   PublishTargetOption | null;
  disabled?:  boolean;
  gameLabel?: string;
}>();
const emit = defineEmits<{ select: [id: string], reload: [] }>();

const targetItems = computed(() => props.targets.map(target => ({
  label:    target.name,
  value:    target.id,
  disabled: !target.configured,
  onSelect: () => emit('select', target.id),
})));

/** Abbreviates the configured destination fingerprint. */
function shortFingerprint(fingerprint: string | null) {
  return fingerprint ? fingerprint.slice(0, 8) : '';
}
</script>
