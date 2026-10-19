<template>
  <span v-if="!failedUrls.has(url)" class="hs-set-icon-tile">
    <img
      ref="image"
      :src="url"
      alt=""
      class="hs-set-icon-image hs-set-icon-image--mono"
      @error="failedUrls.add(url)"
    >
  </span>
</template>

<script setup lang="ts">
import { hearthstoneSetIconUrl } from '~/utils/hearthstone-set-icons';

const props = defineProps<{ setId: string }>();
const { public: { assetBaseUrl } } = useRuntimeConfig();
const fallbackUrl = `${String(assetBaseUrl).replace(/\/+$/, '')}/hearthstone/set/icon/default.svg`;
const failedUrls = ref(new Set<string>());
const image = useTemplateRef<HTMLImageElement>('image');
const url = computed(() => {
  const primaryUrl = hearthstoneSetIconUrl(String(assetBaseUrl), props.setId);
  return failedUrls.value.has(primaryUrl) ? fallbackUrl : primaryUrl;
});

onMounted(() => {
  // SSR images can fail before hydration attaches the error listener.
  // Recover completed failures too, including cached 404 responses.
  if (image.value?.complete && image.value.naturalWidth === 0) {
    failedUrls.value.add(url.value);
  }
});
</script>
