<template>
  <SeriesCatalog
    :entries="entries"
    :types="types"
    :loading="status === 'idle' || status === 'pending'"
    :error="error != null"
    show-major-filter
    @retry="refresh()"
  />
</template>

<script setup lang="ts">
import type { SeriesEntry } from '@tcg-cards/ui/app/utils/series-catalog';
import type { SetProfile } from '#model/magic/schema/set';

definePageMeta({ layout: 'main', title: 'Set' });

const { $orpc } = useNuxtApp();
const gameLocale = useGameLocale();
const { public: { assetBaseUrl } } = useRuntimeConfig();
const { t, te } = useI18n();
useTitle(() => t('magic.set.$self'));

const { data: profiles, status, error, refresh } = useAsyncData(
  'magic-series-catalog',
  () => $orpc.magic.set.profiles(),
  { server: false, default: () => [] },
);

// Preserve the existing major-set distinction; it is separate from present-day legality.
const majorTypes = new Set(['core', 'expansion']);
const inheritedIconTypes = new Set(['promo', 'token', 'memorabilia', 'funny']);
const typeOrder = ['expansion', 'core', 'commander', 'masters', 'promo', 'token', 'art_series'];

const entries = computed<SeriesEntry[]>(() => profiles.value.map(profile => {
  const english = profile.localization.find(row => row.lang === 'en')?.name;
  const localized = profile.localization.find(row => row.lang === gameLocale.value)?.name;
  const name = localized?.trim() ? localized : english?.trim() ? english : profile.setId.toUpperCase();

  return {
    id:            profile.setId,
    name,
    secondaryName: english && english !== name ? english : undefined,
    searchNames:   profile.localization.flatMap(row => row.name == null ? [] : [row.name]),
    type:          te(`magic.set.types.${profile.type}`) ? profile.type : 'other',
    releaseDate:   profile.releaseDate,
    parentId:      profile.parent,
    isMajor:       majorTypes.has(profile.type),
    icon:          iconUrl(profile),
    fallbackIcon:  `${assetBaseUrl}/magic/set/icon/default.svg`,
    to:            `/set/${profile.setId}`,
  };
}));

const types = computed(() => {
  const present = [...new Set(entries.value.map(entry => entry.type))];
  return present.sort((a, b) => {
    const ai = typeOrder.indexOf(a);
    const bi = typeOrder.indexOf(b);
    return (ai < 0 ? typeOrder.length : ai) - (bi < 0 ? typeOrder.length : bi)
      || t(`magic.set.types.${a}`).localeCompare(t(`magic.set.types.${b}`));
  }).map(value => ({ value, label: t(`magic.set.types.${value}`) }));
});

/** Reuses the parent symbol for auxiliary releases without their own symbol. */
function iconUrl(profile: SetProfile): string {
  const id = profile.parent != null && inheritedIconTypes.has(profile.type) ? profile.parent : profile.setId;
  return `${assetBaseUrl}/magic/set/icon/${encodeURIComponent(id)}/default.svg`;
}
</script>
