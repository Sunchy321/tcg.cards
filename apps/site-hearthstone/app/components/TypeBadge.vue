<template>
  <UBadge :size="(size as any)" :class="cls">
    {{ typeLabel }}
    <StatusIcon v-if="status" :status="status" class="ml-1" />
  </UBadge>
</template>

<script setup lang="ts">
import { changeTypeClass, changeTypeLabel } from '~/utils/announcement';

const props = defineProps<{ type: string, status?: string, size?: string }>();

const { t, te } = useI18n();

const cls = computed(() => changeTypeClass(props.type));

const typeLabel = computed(() => {
  const key = `hearthstone.changeType.${props.type}`;
  return te(key) ? t(key) : changeTypeLabel(props.type);
});
</script>
