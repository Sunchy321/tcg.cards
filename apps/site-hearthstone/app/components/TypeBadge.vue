<template>
  <UBadge :size="(size as any)" :class="cls">
    {{ changeTypeLabel(type) }}
    <StatusIcon v-if="status" :status="status" class="ml-1" />
  </UBadge>
</template>

<script setup lang="ts">
import { changeTypeClass, changeTypeLabel } from '~/utils/announcement';

const props = defineProps<{ type: string, status?: string, size?: string }>();

const cls = computed(() => changeTypeClass(props.type));
</script>
