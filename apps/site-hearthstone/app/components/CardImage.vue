<template>
  <div class="relative aspect-68/94 w-full overflow-visible rounded-lg">
    <img
      v-if="!hasError && imageUrl"
      :key="imageUrl"
      :src="imageUrl"
      :alt="cardId"
      class="w-full h-full object-contain scale-125"
      :loading="loading"
      @error="hasError = true"
    >
    <div v-else class="w-full h-full flex items-center justify-center text-gray-400">
      <UIcon name="lucide:image-off" class="text-3xl" />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CardImageOption } from '~/utils/card-image';
import type { ImageCategory } from '#model/hearthstone/schema/data/image';
import { buildCardImageUrl } from '~/utils/card-image';

const props = withDefaults(defineProps<{
  cardId:              string;
  version:             number;
  renderHash?:         string | null;
  variant?:            CardImageOption;
  category?:           ImageCategory;
  hasPremiumMechanic?: boolean;
  loading?:            'eager' | 'lazy';
}>(), {
  variant:            'normal',
  category:           'base',
  renderHash:         null,
  hasPremiumMechanic: false,
  loading:            'lazy',
});

const { public: { assetBaseUrl } } = useRuntimeConfig();

const hasError = ref(false);

const imageUrl = computed(() => {
  if (props.renderHash == null) {
    return null;
  }

  return buildCardImageUrl(assetBaseUrl, props.renderHash, props.variant, props.hasPremiumMechanic, props.category);
});

watch(() => [props.cardId, props.version, props.renderHash, props.variant, props.category, props.hasPremiumMechanic], () => {
  hasError.value = false;
});
</script>
