<template>
  <div class="relative aspect-68/94 w-full overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800">
    <img
      v-if="!hasError && imageUrl"
      :key="imageUrl"
      :src="imageUrl"
      :alt="cardId"
      class="w-full h-full object-contain"
      :loading="loading"
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
  loading?: 'eager' | 'lazy';
}>(), {
  lang:    'zhs',
  variant: 'normal',
  loading: 'lazy',
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

const imageSources = computed(() => {
  const jsonSource = `https://art.hearthstonejson.com/v1/render/latest/${hearthstoneJsonLocales[props.lang]}/256x/${props.cardId}.png`;
  const sources = [
    ...(props.variant === 'normal' ? [jsonSource] : []),
    `${assetBaseUrl}/hearthstone/card/image/webp/${props.version}/${props.lang}/${props.variant}/${props.cardId}.webp`,
  ];

  if (props.variant !== 'normal') {
    sources.push(`${assetBaseUrl}/hearthstone/card/image/webp/${props.version}/${props.lang}/normal/${props.cardId}.webp`);
    sources.push(jsonSource);
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

function onError() {
  if (sourceIndex.value < imageSources.value.length - 1) {
    sourceIndex.value += 1;
    return;
  }

  hasError.value = true;
}

</script>
