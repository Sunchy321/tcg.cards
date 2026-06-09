<template>
  <div class="relative aspect-68/94 w-full overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800">
    <img
      v-if="!hasError && imageUrl"
      :src="imageUrl"
      :alt="cardId"
      class="w-full h-full object-contain"
      :loading="loading"
      @load="onLoad"
      @error="onError"
    >
    <div v-else class="w-full h-full flex items-center justify-center text-gray-400">
      <UIcon name="lucide:image-off" class="text-3xl" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick } from 'vue';
import type { Locale } from '#model/hearthstone/schema/basic';
import type { CardImageOption } from '~/utils/card-image';
import { buildCardImageUrl, buildLegacyCardImageUrl } from '~/utils/card-image';

console.log('========== CardImage.vue LOADED ==========');

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
const hasLoadedSuccessfully = ref(false); // Track if image has ever loaded successfully
let loadTimeout: ReturnType<typeof setTimeout> | null = null;

console.log('[CardImage] Component initialized:', { cardId: props.cardId, version: props.version });

const primaryUrl = computed(() => {
  if (props.renderHash == null) {
    console.log('[CardImage] primaryUrl is null - renderHash is null for cardId:', props.cardId);
    return null;
  }

  const url = buildCardImageUrl(assetBaseUrl, props.renderHash, props.variant, props.hasPremiumMechanic);
  console.log('[CardImage] primaryUrl generated:', url, 'for cardId:', props.cardId);
  return url;
});

const legacyUrl = computed(() => {
  const url = buildLegacyCardImageUrl(assetBaseUrl, props.version, props.variant, props.cardId, props.lang);
  console.log('[CardImage] legacyUrl generated:', url, 'for cardId:', props.cardId);
  return url;
});

const jsonUrl = computed(() => {
  if (props.variant !== 'normal') {
    return null;
  }

  return `https://art.hearthstonejson.com/v1/render/latest/${hearthstoneJsonLocales[props.lang as Locale]}/256x/${props.cardId}.png`;
});

const imageUrl = computed(() => {
  console.log('[CardImage] Computing imageUrl, stage:', stage.value, 'cardId:', props.cardId);
  let url;
  switch (stage.value) {
  case 'primary':
    url = primaryUrl.value ?? legacyUrl.value;
    break;
  case 'legacy':
    url = legacyUrl.value;
    break;
  case 'hearthstonejson':
    url = jsonUrl.value ?? '/card-not-found.svg';
    break;
  default:
    url = '/card-not-found.svg';
  }
  console.log('[CardImage] Final imageUrl:', url, 'for cardId:', props.cardId);
  return url;
});

watch(() => [props.cardId, props.version, props.renderHash, props.variant, props.lang, props.hasPremiumMechanic], () => {
  stage.value = 'primary';
  hasError.value = false;
  hasLoadedSuccessfully.value = false; // Reset success flag when card changes
  if (loadTimeout) {
    clearTimeout(loadTimeout);
    loadTimeout = null;
  }
});

const startLoadTimeout = () => {
  if (loadTimeout) {
    clearTimeout(loadTimeout);
  }
  
  // Don't start timeout if there's no image to load or if already loaded successfully
  if (!imageUrl.value || imageUrl.value === '/card-not-found.svg' || hasLoadedSuccessfully.value) {
    console.log('[CardImage] No need for timeout - no image, already at fallback, or already loaded');
    return;
  }
  
  loadTimeout = setTimeout(async () => {
    console.log('[CardImage] TIMEOUT FIRED - cardId:', props.cardId, 'stage:', stage.value, 'currentUrl:', imageUrl.value);
    
    // Double-check: only trigger fallback if we're still in loading state AND haven't loaded successfully yet
    const currentUrl = imageUrl.value;
    const isStillLoading = !hasLoadedSuccessfully.value && 
                           (stage.value === 'primary' || stage.value === 'legacy') && 
                           currentUrl !== '/card-not-found.svg' &&
                           !currentUrl?.includes('art.hearthstonejson.com');
    
    console.log('[CardImage] Timeout check - isStillLoading:', isStillLoading, 'hasLoadedSuccessfully:', hasLoadedSuccessfully.value, 'jsonUrl exists:', !!jsonUrl.value);
    
    if (isStillLoading && jsonUrl.value != null) {
      console.log('[CardImage] Forcing fallback to hearthstonejson for cardId:', props.cardId);
      stage.value = 'hearthstonejson';
      // Wait for Vue to update the DOM, then force img reload
      await nextTick();
      const img = document.querySelector(`img[alt="${props.cardId}"]`);
      if (img && img.src !== jsonUrl.value) {
        console.log('[CardImage] Found img element, forcing reload with new src');
        img.src = jsonUrl.value;
      } else {
        console.log('[CardImage] Could not find img element or src already correct');
      }
    } else if (jsonUrl.value == null && isStillLoading) {
      console.log('[CardImage] Cannot fallback - jsonUrl is null, variant:', props.variant);
      hasError.value = true;
    } else {
      console.log('[CardImage] Timeout fired but image already resolved or not in loading state');
    }
  }, 2000); // 2 second timeout for faster fallback
};

const onError = (e: Event) => {
  const img = e.target as HTMLImageElement;
  console.log('[CardImage] Image load ERROR - cardId:', props.cardId, 'stage:', stage.value, 'src:', img.src, 'naturalWidth:', img.naturalWidth);

  if (stage.value === 'primary') {
    if (primaryUrl.value != null) {
      console.log('[CardImage] Primary failed, trying legacy');
      stage.value = 'legacy';
      setTimeout(() => { img.src = legacyUrl.value; }, 0);
      return;
    }
  }

  if (stage.value === 'legacy') {
    if (jsonUrl.value != null) {
      console.log('[CardImage] Legacy failed, trying hearthstonejson');
      stage.value = 'hearthstonejson';
      setTimeout(() => { img.src = jsonUrl.value; }, 0);
      return;
    }
  }

  console.log('[CardImage] All sources failed for cardId:', props.cardId);
  hasError.value = true;
};

const onLoad = (e: Event) => {
  const img = e.target as HTMLImageElement;
  console.log('[CardImage] Image loaded successfully:', img.src, 'cardId:', props.cardId);
  
  // Mark as successfully loaded and clear timeout
  hasLoadedSuccessfully.value = true;
  if (loadTimeout) {
    clearTimeout(loadTimeout);
    loadTimeout = null;
  }
};

// Start timeout when imageUrl changes
watch(imageUrl, () => {
  startLoadTimeout();
}, { immediate: true });
</script>
