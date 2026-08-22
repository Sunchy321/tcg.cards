<template>
  <header class="docs-header sticky top-0 z-50 border-b border-default bg-default/92 backdrop-blur-xl">
    <div class="flex h-15 items-center gap-4 px-4 lg:px-6">
      <NuxtLink to="/v1" class="group flex items-center gap-3 text-highlighted">
        <span class="grid size-8 place-items-center rounded-md bg-primary text-inverted shadow-sm shadow-primary/20">
          <Icon name="i:logo" :size="22" />
        </span>
        <span class="hidden font-semibold tracking-tight sm:inline">TCG.CARDS</span>
      </NuxtLink>

      <div class="h-5 w-px bg-accented" />
      <span class="min-w-0 truncate text-sm font-medium text-muted">{{ gameName }}</span>

      <div class="ml-auto flex items-center gap-1.5">
        <SearchCommand />
        <UDropdownMenu v-if="onVersionedPage" :items="versionItems" class="shrink-0">
          <UButton
            color="neutral"
            variant="outline"
            size="sm"
            class="font-mono"
            trailing-icon="i-lucide-chevron-down"
          >
            {{ currentVersion }}
          </UButton>
          <template #item="{ item }">
            <span class="flex w-full items-center justify-between gap-6">
              <span class="font-mono">{{ item.label }}</span>
              <UIcon v-if="item.label === currentVersion" name="i-lucide-check" class="size-3.5 text-primary" />
            </span>
          </template>
        </UDropdownMenu>
        <UButton
          icon="i-lucide-settings"
          color="neutral"
          variant="ghost"
          aria-label="Settings"
          :to="'/settings'"
        />
        <UColorModeButton color="neutral" variant="ghost" />
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { DOC_VERSIONS, versionFromPath, withVersion } from '../../lib/versions';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();

const game = computed(() => route.path.split('/')[2]);
const gameName = computed(() => game.value === 'magic' || game.value === 'hearthstone' ? t(`${game.value}.name`) : t('portal.title'));

const onVersionedPage = computed(() => versionFromPath(route.path) !== null);

const currentVersion = computed(() => versionFromPath(route.path) ?? DOC_VERSIONS[0]);

const versionItems = DOC_VERSIONS.map(version => ({
  label:  version,
  onSelect: () => {
    if (version !== currentVersion.value) {
      router.push(withVersion(route.path, version));
    }
  },
}));
</script>
