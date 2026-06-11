<template>
  <div class="hs-card-image-shell relative aspect-68/94 w-full overflow-hidden rounded-lg">
    <img
      v-if="!hasError && imageUrl"
      :src="imageUrl"
      :alt="cardId"
      class="w-full h-full object-contain"
      :loading="loading"
      @load="onLoad"
      @error="onError"
    >
    <div v-else class="hs-subtle-text w-full h-full flex items-center justify-center">
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

type ImageStage = 'primary' | 'legacy' | 'hearthstonejson' | 'fallback';

const stage = ref<ImageStage>('primary');
const hasError = ref(false);
const hasLoadedSuccessfully = ref(false);
let loadTimeout: ReturnType<typeof setTimeout> | null = null;

const primaryUrl = computed(() => {
  if (props.renderHash == null) {
    return null;
  }

  return buildCardImageUrl(assetBaseUrl, props.renderHash, props.variant, props.hasPremiumMechanic);
});

const legacyUrl = computed(() =>
  buildLegacyCardImageUrl(assetBaseUrl, props.version, props.variant, props.cardId, props.lang),
);

const jsonUrl = computed(() => {
  if (props.variant !== 'normal') {
    return null;
  }

  return `https://art.hearthstonejson.com/v1/render/latest/${hearthstoneJsonLocales[props.lang as Locale]}/256x/${props.cardId}.png`;
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

function clearLoadTimeout() {
  if (loadTimeout == null) {
    return;
  }

  clearTimeout(loadTimeout);
  loadTimeout = null;
}

function useHearthstoneJson() {
  if (jsonUrl.value == null) {
    return false;
  }

  hasError.value = false;
  stage.value = 'hearthstonejson';
  return true;
}

watch(() => [props.cardId, props.version, props.renderHash, props.variant, props.lang, props.hasPremiumMechanic], () => {
  stage.value = 'primary';
  hasError.value = false;
  hasLoadedSuccessfully.value = false;
  clearLoadTimeout();
});

const startLoadTimeout = () => {
  clearLoadTimeout();

  if (!import.meta.client) {
    return;
  }

  if (!imageUrl.value || imageUrl.value === '/card-not-found.svg' || hasLoadedSuccessfully.value) {
    return;
  }

  loadTimeout = setTimeout(() => {
    const currentUrl = imageUrl.value;
    const isStillLoading = !hasLoadedSuccessfully.value
      && (stage.value === 'primary' || stage.value === 'legacy')
      && currentUrl !== '/card-not-found.svg'
      && !currentUrl?.includes('art.hearthstonejson.com');

    if (!isStillLoading) {
      return;
    }

    if (!useHearthstoneJson()) {
      hasError.value = true;
    }
  }, 2000);
};

const onError = () => {
  clearLoadTimeout();

  if (stage.value === 'primary' && primaryUrl.value != null) {
    hasError.value = false;
    stage.value = 'legacy';
    return;
  }

  if ((stage.value === 'primary' || stage.value === 'legacy') && useHearthstoneJson()) {
    return;
  }

  hasError.value = true;
};

const onLoad = () => {
  hasLoadedSuccessfully.value = true;
  clearLoadTimeout();
};

watch(imageUrl, () => {
  startLoadTimeout();
}, { immediate: true });
</script>
