<template>
  <div class="relative aspect-68/94 overflow-visible rounded-lg">
    <img
      v-if="!hasError && imageUrl"
      :key="imageUrl"
      :src="imageUrl"
      :alt="cardId"
      class="w-full h-full object-contain scale-125"
      :loading="loading"
      @error="hasError = true"
    >
    <img
      v-else
      :src="placeholderSrc"
      :alt="cardId"
      class="w-full h-full object-contain scale-125"
      :loading="loading"
      @error="(e) => ((e.target as HTMLImageElement).src = '/placeholder/minion.svg')"
    >
  </div>
</template>

<script setup lang="ts">
import type { CardImageOption } from '~/utils/card-image';
import type { ImageCategory } from '#model/hearthstone/schema/data/image';
import { buildCardImageUrl, getCardPlaceholder } from '~/utils/card-image';

const props = withDefaults(defineProps<{
  cardId:     string;
  version:    number;
  type:       string;
  renderHash?: string | null;
  variant?:   CardImageOption;
  category?:  ImageCategory;
  loading?:   'eager' | 'lazy';
  mechanics?: Record<string, boolean | number>;
}>(), {
  variant:    'normal',
  category:   'base',
  renderHash: null,
  loading:    'lazy',
  mechanics:  undefined,
});

const { public: { assetBaseUrl } } = useRuntimeConfig();

const hasError = ref(false);

const hasPremiumMechanic = computed(() => !!props.mechanics?.['12']);

const imageUrl = computed(() => {
  if (props.renderHash == null) {
    return null;
  }

  return buildCardImageUrl(assetBaseUrl, props.renderHash, props.variant, hasPremiumMechanic.value, props.category);
});

const placeholderSrc = computed(() => getCardPlaceholder(props.type, props.variant, props.mechanics));

watch(() => [props.cardId, props.version, props.renderHash, props.variant, props.category, props.mechanics], () => {
  hasError.value = false;
});
</script>
