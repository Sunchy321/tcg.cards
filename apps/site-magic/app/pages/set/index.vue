<template>
  <div>
    <div v-if="loading" class="flex justify-center py-12">
      <UIcon name="lucide:loader" class="animate-spin w-8 h-8 text-gray-400" />
    </div>

    <div v-else class="rounded-lg overflow-hidden ring-1 ring-black/10 dark:ring-white/10 bg-white dark:bg-neutral-800 text-black dark:text-white">
      <div
        v-for="({ setId, localization, type, parent, indent }, index) in profileList"
        :key="setId"
        class="set-row flex items-center gap-2 px-3 py-2 text-sm"
        :class="{
          'bg-black/5 dark:bg-white/5': index % 2 === 0,
          'text-primary': type === 'core' || type === 'expansion',
          'border-t border-black/5 dark:border-white/5': index > 0,
        }"
      >
        <!-- Indent spacer for child sets -->
        <div v-if="indent > 0" :style="`width: ${indent * 16}px`" class="shrink-0" />

        <!-- Set icon -->
        <img
          v-if="iconUrl(setId, type, parent) != null"
          class="h-4 w-4 object-contain shrink-0"
          :src="iconUrl(setId, type, parent)"
        >
        <div v-else class="w-4 shrink-0" />

        <!-- Set name -->
        <span class="font-medium flex-1 truncate">{{ nameOf(localization) ?? setId }}</span>

        <!-- Set ID code -->
        <span class="font-mono text-xs text-gray-500 dark:text-gray-400 shrink-0">{{ setId }}</span>

        <!-- Navigate button -->
        <UButton
          :to="`/set/${setId}`"
          icon="lucide:chevron-right"
          variant="ghost"
          color="neutral"
          size="xs"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { SetProfile, SetLocalization } from '#model/magic/schema/set';

definePageMeta({
  layout: 'main',
  title:  'Set',
});

const { $orpc } = useNuxtApp();
const gameLocale = useGameLocale();
const { public: { assetBaseUrl } } = useRuntimeConfig();
const { t } = useI18n();
const title = useTitle();

title.value = t('magic.set.$self');

// ── Data ────────────────────────────────────────────────────────────────────

const loading = ref(true);
const profiles = ref<Record<string, SetProfile>>({});

// ── Tree building ────────────────────────────────────────────────────────────

type SetMap = { profile: SetProfile, children?: SetMap[] };

function buildTree(profileList: SetProfile[]): SetMap[] {
  // Sort profiles so parents come before children
  let remaining = [...profileList];
  const ordered: SetProfile[] = [];

  while (remaining.length > 0) {
    const toInsert = remaining.filter(p =>
      p.parent == null || ordered.some(o => o.setId === p.parent),
    );

    if (toInsert.length === 0) {
      // Avoid infinite loop: push the rest as-is
      ordered.push(...remaining);
      break;
    }

    ordered.push(...toInsert);
    remaining = remaining.filter(p => !toInsert.includes(p));
  }

  // Build tree map
  const map: SetMap[] = [];

  function insertSet(m: SetMap[], profile: SetProfile): boolean {
    if (profile.parent == null) {
      m.push({ profile });
      return true;
    }

    for (const node of m) {
      if (profile.parent === node.profile.setId) {
        (node.children ??= []).push({ profile });
        return true;
      }

      if (node.children && insertSet(node.children, profile)) {
        return true;
      }
    }

    return false;
  }

  for (const profile of ordered) {
    insertSet(map, profile);
  }

  // Sort by release date descending
  function sortMap(m: SetMap[]) {
    for (const node of m) {
      if (node.children) sortMap(node.children);
    }

    m.sort((a, b) => {
      const ra = a.profile.releaseDate;
      const rb = b.profile.releaseDate;

      if (ra == null && rb == null) return 0;
      if (ra == null) return -1;
      if (rb == null) return 1;

      return ra < rb ? 1 : ra > rb ? -1 : 0;
    });
  }

  sortMap(map);
  return map;
}

const profileList = computed(() => {
  const list: (SetProfile & { indent: number })[] = [];

  function flatten(m: SetMap[], indent = 0) {
    for (const node of m) {
      list.push({ ...node.profile, indent });
      if (node.children) flatten(node.children, indent + 1);
    }
  }

  flatten(buildTree(Object.values(profiles.value)));
  return list;
});

// ── Helpers ──────────────────────────────────────────────────────────────────

const nameOf = (localizations: SetLocalization[]) => {
  return (
    localizations.find(l => l.lang === gameLocale.value)?.name
    ?? localizations.find(l => l.lang === 'en')?.name
    ?? null
  );
};

const auxSetTypes = ['promo', 'token', 'memorabilia', 'funny'];

const iconUrl = (setId: string, type: string, parent: string | null) => {
  if (parent != null && auxSetTypes.includes(type)) {
    return undefined;
  }

  return `${assetBaseUrl}/magic/set/icon/${setId}/default.svg`;
};

// ── Load ─────────────────────────────────────────────────────────────────────

onMounted(async () => {
  loading.value = true;

  try {
    const setIds = await $orpc.magic.set.list();

    const profileResults = await Promise.all(
      setIds.map(id => $orpc.magic.set.profile(id).catch(() => null)),
    );

    const map: Record<string, SetProfile> = {};

    for (let i = 0; i < setIds.length; i++) {
      const p = profileResults[i];
      if (p) map[setIds[i]!] = p;
    }

    profiles.value = map;
  } finally {
    loading.value = false;
  }
});
</script>
