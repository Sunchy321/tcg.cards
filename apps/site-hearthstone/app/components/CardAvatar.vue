<template>
  <component
    :is="noLink ? 'span' : NuxtLink"
    v-bind="noLink ? {} : linkProps"
    :class="['hs-card-avatar inline cursor-pointer', { underline: !hasExternalClass }]"
  >
    <UPopover
      v-if="renderHash != null"
      mode="hover"
      :content="{ side: 'top', align: 'center' }"
      :arrow="false"
      :open-delay="0"
      :close-delay="100"
      :ui="{ content: 'bg-transparent shadow-none ring-0 border-0 p-0 pointer-events-none' }"
    >
      <span>{{ displayName }}</span>
      <template #content>
        <CardImage
          class="card-avatar-popover-image"
          :card-id="cardId"
          :version="resolvedVersion"
          :lang="resolvedLang"
          :render-hash="renderHash"
          :type="type"
          :variant="variant"
        />
      </template>
    </UPopover>
    <span v-else>{{ displayName }}</span>
  </component>
</template>

<script setup lang="ts">
import { NuxtLink } from '#components';
import type { Locale } from '#model/hearthstone/schema/basic';
import type { CardProfile } from '#model/hearthstone/schema/card';

const props = withDefaults(defineProps<{
  cardId:      string;
  version?:    number;
  lang?:       Locale;
  renderHash?: string | null;
  type:        string;
  /** Pre-resolved localized card name; skips the profile fetch when provided. */
  name?:       string | null;
  variant?:    CardImageOption;
  noLink?:     boolean;
}>(), {
  version:    undefined,
  lang:       undefined,
  renderHash: null,
  name:       null,
  variant:    'normal',
  noLink:     false,
});

const { $orpc } = useNuxtApp();
const gameLocale = useGameLocale();
const attrs = useAttrs();

const hasExternalClass = computed(() => !!attrs.class);

const profile = ref<CardProfile | null>(null);

async function loadProfile(cardId: string) {
  try {
    profile.value = await $orpc.hearthstone.card.profile(cardId);
  } catch {
    profile.value = null;
  }
}

onMounted(() => {
  if (props.name == null) void loadProfile(props.cardId);
});

watch(() => props.cardId, newId => {
  if (props.name == null) void loadProfile(newId);
});

const resolvedVersion = computed(() =>
  props.version ?? profile.value?.version?.[0]?.[0] ?? 0,
);

const resolvedLang = computed(() =>
  props.lang ?? gameLocale.value,
);

const displayName = computed(() => {
  if (props.name != null) return props.name;
  if (!profile.value) return props.cardId;
  const displayLang = resolvedLang.value;
  const loc = profile.value.localization.find(l => l.lang === displayLang)
    ?? profile.value.localization[0];
  return loc?.name ?? props.cardId;
});

const linkProps = computed(() => ({
  to:     `/card/${props.cardId}`,
  target: '_blank',
}));

</script>

<style>
.card-avatar-popover-image {
  width: 250px;
}
</style>
