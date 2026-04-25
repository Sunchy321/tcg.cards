<template>
  <div class="relative aspect-68/94 w-full overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800">
    <img
      :src="imageUrl"
      :alt="cardId"
      class="w-full h-full object-contain"
      loading="lazy"
      @error="onError"
    >
  </div>
</template>

<script setup lang="ts">
import type { CardImageOption } from '~/utils/card-image';
import { buildCardImageUrl, buildLegacyCardImageUrl } from '~/utils/card-image';

const props = withDefaults(defineProps<{
  cardId:      string;
  version:     number;
  renderHash?: string | null;
  variant?:    CardImageOption;
}>(), {
  variant:    'normal',
  renderHash: null,
});

const { public: { assetBaseUrl } } = useRuntimeConfig();

const stage = ref<'primary' | 'legacy' | 'fallback'>('primary');

const primaryUrl = computed(() => {
  if (props.renderHash == null) {
    return null;
  }

  return buildCardImageUrl(assetBaseUrl, props.renderHash, props.variant);
});

const legacyUrl = computed(() =>
  buildLegacyCardImageUrl(assetBaseUrl, props.version, props.variant, props.cardId),
);

const imageUrl = computed(() => {
  if (stage.value === 'fallback') {
    return '/card-not-found.svg';
  }

  if (stage.value === 'legacy') {
    return legacyUrl.value;
  }

  return primaryUrl.value ?? legacyUrl.value;
});

watch(() => [props.cardId, props.version, props.renderHash, props.variant], () => {
  stage.value = 'primary';
}, { immediate: true });

const onError = (e: Event) => {
  const img = e.target as HTMLImageElement;

  if (stage.value === 'primary' && primaryUrl.value != null) {
    stage.value = 'legacy';
    img.src = legacyUrl.value;
    return;
  }

  stage.value = 'fallback';
  img.src = '/card-not-found.svg';
};
</script>
