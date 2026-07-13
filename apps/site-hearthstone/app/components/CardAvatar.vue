<template>
  <component
    :is="noLink ? 'span' : NuxtLink"
    v-bind="noLink ? {} : linkProps"
    :class="['hs-card-avatar inline cursor-pointer', { underline: !hasExternalClass }]"
  >
    <UPopover
      v-if="renderHash != null"
      v-model:open="isOpen"
      :content="{ side: 'top', align: 'center' }"
      :arrow="false"
      :ui="{ content: 'bg-transparent shadow-none ring-0 border-0 p-0' }"
    >
      <span @mouseenter="onMouseEnter" @mouseleave="onMouseLeave">{{ displayName }}</span>
      <template #content>
        <div @mouseenter="onMouseEnter" @mouseleave="onMouseLeave">
          <CardImage
            class="card-avatar-popover-image"
            :card-id="cardId"
            :version="resolvedVersion"
            :lang="resolvedLang"
            :render-hash="renderHash"
          />
        </div>
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
  noLink?:     boolean;
}>(), {
  version:    undefined,
  lang:       undefined,
  renderHash: null,
  noLink:     false,
});

const { $orpc } = useNuxtApp();
const gameLocale = useGameLocale();
const attrs = useAttrs();

const hasExternalClass = computed(() => !!attrs.class);

const profile = ref<CardProfile | null>(null);

onMounted(async () => {
  try {
    profile.value = await $orpc.hearthstone.card.profile(props.cardId);
  } catch {
    profile.value = null;
  }
});

watch(() => props.cardId, async newId => {
  try {
    profile.value = await $orpc.hearthstone.card.profile(newId);
  } catch {
    profile.value = null;
  }
});

const resolvedVersion = computed(() =>
  props.version ?? profile.value?.version?.[0]?.[0] ?? 0,
);

const resolvedLang = computed(() =>
  props.lang ?? gameLocale.value,
);

const displayName = computed(() => {
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

// ── Hover popover ────────────────────────────────────────────────────────────

const isOpen = ref(false);
let closeTimer: ReturnType<typeof setTimeout> | null = null;

const onMouseEnter = () => {
  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }
  isOpen.value = true;
};

const onMouseLeave = () => {
  closeTimer = setTimeout(() => {
    isOpen.value = false;
  }, 120);
};
</script>

<style>
.card-avatar-popover-image {
  width: 250px;
}
</style>
