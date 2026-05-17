<template>
  <div class="relative aspect-68/94 w-full overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800">
    <img
      v-if="!hasError && imageUrl"
      :src="imageUrl"
      :alt="cardId"
      class="w-full h-full object-contain"
      loading="lazy"
      @load="onLoad"
      @error="onError"
    >
    <div v-else class="w-full h-full flex items-center justify-center text-gray-400">
      <UIcon name="lucide:image-off" class="text-4xl" />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Locale } from '#model/hearthstone/schema/basic';

const props = withDefaults(defineProps<{
  cardId:   string;
  version:  number;
  lang?:    Locale;
  variant?: string;
}>(), {
  lang:    'zhs',
  variant: 'normal',
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

const sourceIndex = ref(0);
const hasError = ref(false);
const errorTimer = ref<ReturnType<typeof setTimeout> | null>(null);

const imageSources = computed(() => {
  const sources = [
    `${assetBaseUrl}/hearthstone/card/image/webp/${props.version}/${props.lang}/${props.variant}/${props.cardId}.webp`,
  ];

  if (props.variant === 'normal') {
    sources.push(`https://art.hearthstonejson.com/v1/render/latest/${hearthstoneJsonLocales[props.lang]}/256x/${props.cardId}.png`);
  }

  return sources;
});

const imageUrl = computed(() => {
  return imageSources.value[sourceIndex.value];
});

watch(() => [props.cardId, props.version, props.lang, props.variant], () => {
  sourceIndex.value = 0;
  hasError.value = false;
});

const clearErrorTimer = () => {
  if (errorTimer.value != null) {
    clearTimeout(errorTimer.value);
    errorTimer.value = null;
  }
};

function onError() {
  clearErrorTimer();

  if (sourceIndex.value < imageSources.value.length - 1) {
    sourceIndex.value += 1;
    return;
  }

  hasError.value = true;
}

watch(imageUrl, () => {
  clearErrorTimer();

  if (import.meta.client && imageUrl.value != null && !hasError.value) {
    errorTimer.value = setTimeout(onError, 2500);
  }
}, { immediate: true });

const onLoad = () => {
  clearErrorTimer();
};

onBeforeUnmount(clearErrorTimer);
</script>
