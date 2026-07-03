<template>
  <div class="relative aspect-68/94 w-full overflow-visible rounded-lg">
    <img
      v-if="!hasError && imageUrl"
      :key="imageUrl"
      :src="imageUrl"
      :alt="cardId"
      class="w-full h-full object-contain scale-125"
      :loading="loading"
      @error="onError"
    >
    <div v-else class="w-full h-full flex items-center justify-center text-gray-400">
      <UIcon name="lucide:image-off" class="text-3xl" />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Locale } from '#model/hearthstone/schema/basic';
import type { CardImageOption } from '~/utils/card-image';
import { buildCardImageUrl, buildLegacyCardImageUrl } from '~/utils/card-image';

const props = withDefaults(defineProps<{
  cardId:              string;
  version:             number;
  lang?:               Locale;
  renderHash?:         string | null;
  variant?:            CardImageOption;
  hasPremiumMechanic?: boolean;
  loading?:            'eager' | 'lazy';
}>(), {
  lang:               'zhs',
  variant:            'normal',
  renderHash:         null,
  hasPremiumMechanic: false,
  loading:            'lazy',
});

const { public: { assetBaseUrl } } = useRuntimeConfig();

const hearthstoneJsonLocales: Record<Locale, string> = {
  en:  'enUS',
  de:  'deDE',
  es:  'esES',
  fr:  'frFR',
  it:  'itIT',
  ja:  'jaJP',
  ko:  'koKR',
  mx:  'esMX',
  pl:  'plPL',
  pt:  'ptBR',
  ru:  'ruRU',
  th:  'thTH',
  zhs: 'zhCN',
  zht: 'zhTW',
};

const stage = ref<'primary' | 'legacy' | 'hearthstonejson' | 'fallback'>('primary');
const hasError = ref(false);

const primaryUrl = computed(() => {
  if (props.renderHash == null) {
    return null;
  }

  return buildCardImageUrl(assetBaseUrl, props.renderHash, props.variant, props.hasPremiumMechanic);
});

const legacyUrl = computed(() =>
  buildLegacyCardImageUrl(assetBaseUrl, props.version, props.variant, props.cardId),
);

const jsonUrl = computed(() => {
  if (props.variant !== 'normal') {
    return null;
  }

  return `https://art.hearthstonejson.com/v1/render/latest/${hearthstoneJsonLocales[props.lang]}/256x/${props.cardId}.png`;
});

const imageUrl = computed(() => {
  switch (stage.value) {
  case 'primary':
    return primaryUrl.value ?? legacyUrl.value;
  case 'legacy':
    return legacyUrl.value;
  case 'hearthstonejson':
    return jsonUrl.value ?? '/card-not-found.svg';
  default:
    return '/card-not-found.svg';
  }
});

watch(() => [props.cardId, props.version, props.renderHash, props.variant, props.lang, props.hasPremiumMechanic], () => {
  stage.value = 'primary';
  hasError.value = false;
});

const onError = (e: Event) => {
  const img = e.target as HTMLImageElement;

  if (stage.value === 'primary' && primaryUrl.value != null) {
    stage.value = 'legacy';
    img.src = legacyUrl.value;
    return;
  }

  if (stage.value === 'legacy' && jsonUrl.value != null) {
    stage.value = 'hearthstonejson';
    img.src = jsonUrl.value;
    return;
  }

  hasError.value = true;
};
</script>
