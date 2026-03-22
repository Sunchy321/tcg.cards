<template>
  <div class="relative aspect-68/94 w-full overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800">
    <img
      v-if="imageUrl"
      :src="imageUrl"
      :alt="cardId"
      class="w-full h-full object-contain"
      loading="lazy"
      @error="onError"
    >
    <div v-else class="w-full h-full flex items-center justify-center text-gray-400">
      <UIcon name="lucide:image-off" class="text-4xl" />
    </div>
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{
  cardId:   string;
  version:  number;
  variant?: string;
}>(), {
  variant: 'normal',
});

const { public: { assetBaseUrl } } = useRuntimeConfig();

const imageUrl = computed(() => {
  return `${assetBaseUrl}/hearthstone/card/image/webp/${props.version}/zhs/${props.variant}/${props.cardId}.webp`;
});

const hasError = ref(false);

const onError = (e: Event) => {
  hasError.value = true;
  (e.target as HTMLImageElement).src = '/card-not-found.svg';
};
</script>
