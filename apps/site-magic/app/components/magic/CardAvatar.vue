<template>
  <component
    :is="onThisPage ? 'span' : NuxtLink"
    v-bind="onThisPage ? {} : linkProps"
    class="magic-card-avatar"
  >
    <UPopover
      v-if="!onThisPage && imageVersion"
      v-model:open="isOpen"
      :content="{ side: 'top', align: 'start' }"
    >
      <span :lang="lang" @mouseenter="onMouseEnter" @mouseleave="onMouseLeave">{{ displayText }}</span>
      <template #content>
        <div @mouseenter="onMouseEnter" @mouseleave="onMouseLeave">
          <MagicCardImage
            class="card-avatar-popover-image"
            :lang="imageVersion.lang"
            :set="imageVersion.set"
            :number="imageVersion.number"
            :layout="imageVersion.layout"
            :full-image-type="imageVersion.fullImageType"
            :part="part"
          />
        </div>
      </template>
    </UPopover>
    <span v-else :lang="lang">{{ displayText }}</span>
  </component>
</template>

<script setup lang="ts">
import { NuxtLink } from '#components';
import type { CardProfile } from '#model/magic/schema/card';
import { locale as localeSchema } from '#model/magic/schema/basic';

type Version = {
  locale:  string;
  lang:    string;
  set?:    string;
  number?: string;
};

const props = withDefaults(defineProps<{
  id:       string;
  part?:    number;
  version?: Version;
  text?:    string;
}>(), {
  part:    undefined,
  version: undefined,
  text:    undefined,
});

const { $orpc } = useNuxtApp();
const router = useRouter();
const route = useRoute();
const gameLocale = useGameLocale('magic');
const locales = localeSchema.options;

const profile = ref<CardProfile | null>(null);

onMounted(async () => {
  try {
    profile.value = await $orpc.magic.card.profile(props.id);
  } catch {
    // silently fail – display ID as fallback
  }
});

watch(() => props.id, async newId => {
  try {
    profile.value = await $orpc.magic.card.profile(newId);
  } catch {
    profile.value = null;
  }
});

// ── computed ────────────────────────────────────────────────────────────────

const locale = computed(() => props.version?.locale ?? gameLocale.value);

const lang = computed(() => props.version?.lang ?? gameLocale.value);

const name = computed(() => {
  if (!profile.value) {
    return null;
  }

  return profile.value.localization.find(l => l.locale === locale.value)?.name
    ?? profile.value.localization.find(l => l.locale === locales[0])?.name
    ?? props.id;
});

const displayText = computed(() =>
  props.text ?? name.value ?? props.id,
);

const imageVersion = computed(() => {
  const versions = profile.value?.versions;
  if (!versions || versions.length === 0) {
    return null;
  }

  // If caller pinned a specific set/number, try to match it
  if (props.version?.set && props.version.number) {
    const pinned = versions.find(
      v => v.set === props.version!.set && v.number === props.version!.number,
    );
    if (pinned) {
      return pinned;
    }
  }

  // Prefer current locale's lang, then first locale, then any
  const byLang = versions.filter(v => v.lang === lang.value);
  const candidates = byLang.length > 0
    ? byLang
    : versions.filter(v => v.lang === locales[0]).length > 0
      ? versions.filter(v => v.lang === locales[0])
      : [...versions];

  // Pick latest release
  return [...candidates].sort((a, b) =>
    b.releaseDate.localeCompare(a.releaseDate),
  )[0] ?? null;
});

const linkHref = computed(() =>
  router.resolve({
    path:  `/magic/card/${props.id}`,
    query: {
      ...(props.version?.locale ? { locale: props.version.locale } : {}),
      ...(props.version?.set ? { set: props.version.set } : {}),
      ...(props.version?.number ? { number: props.version.number } : {}),
      ...(props.part != null ? { part: props.part } : {}),
    },
  }).href,
);

const onThisPage = computed(() => linkHref.value === route.path);

const linkProps = computed(() => ({
  to:     linkHref.value,
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
.magic-card-avatar {
  display: inline;
  text-decoration: underline;
  cursor: pointer;
}

.card-avatar-popover-image {
  width: 250px;
}
</style>
