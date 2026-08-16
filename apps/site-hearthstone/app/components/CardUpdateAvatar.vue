<template>
  <component
    :is="noLink ? 'span' : NuxtLink"
    v-bind="noLink ? {} : linkProps"
    :class="['hs-card-update-avatar inline cursor-pointer', { underline: !hasExternalClass }]"
  >
    <UPopover
      v-if="prev != null || curr != null"
      mode="hover"
      :content="{ side: 'top', align: 'center' }"
      :arrow="false"
      :open-delay="0"
      :close-delay="100"
      :ui="{ content: 'bg-transparent shadow-none ring-0 border-0 p-0 pointer-events-none' }"
    >
      <span>{{ displayName }}</span>
      <template #content>
        <div class="flex items-center gap-1.5">
          <CardImage
            v-if="prev != null"
            class="card-update-avatar-image"
            :card-id="cardId"
            :version="version"
            :render-hash="prev.hash"
            :type="type"
            :category="prev.category"
            :variant="variantOf(prev.template)"
          />
          <UIcon v-if="prev != null && curr != null" name="lucide:arrow-right" class="shrink-0 text-gray-400 dark:text-gray-500" />
          <CardImage
            v-if="curr != null"
            class="card-update-avatar-image"
            :card-id="cardId"
            :version="version"
            :render-hash="curr.hash"
            :type="type"
            :category="curr.category"
            :variant="variantOf(curr.template)"
          />
        </div>
      </template>
    </UPopover>
    <span v-else>{{ displayName }}</span>
  </component>
</template>

<script setup lang="ts">
import { NuxtLink } from '#components';

interface AvatarSide {
  hash:     string;
  category: string;
  template: string;
}

const props = withDefaults(defineProps<{
  cardId:  string;
  version: number;
  type:    string;
  name?:   string | null;
  prev?:   AvatarSide | null;
  curr?:   AvatarSide | null;
  noLink?: boolean;
}>(), {
  name:   null,
  prev:   null,
  curr:   null,
  noLink: false,
});

const attrs = useAttrs();

const hasExternalClass = computed(() => !!attrs.class);

const displayName = computed(() => props.name ?? props.cardId);

const variantOf = (template: string) => template === 'battlegrounds' ? 'battlegrounds' : 'normal';

const linkProps = computed(() => ({
  to:     `/card/${props.cardId}`,
  target: '_blank',
}));
</script>

<style>
.card-update-avatar-image {
  width: 200px;
}
</style>
