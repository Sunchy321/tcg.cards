<template>
  <MainLayout>
    <div class="flex items-center mt-60 justify-center">
      <div class="w-[90%] md:w-[75%] flex items-stretch rounded-md shadow-[0_20px_60px_rgba(0,0,0,0.3)] overflow-hidden bg-white dark:bg-gray-900">
        <UDropdownMenu
          :items="gameMenuItems"
          :ui="{ content: 'min-w-fit' }"
        >
          <UButton
            :icon="selectedGame.icon"
            trailing-icon="lucide:chevron-down"
            variant="ghost"
            color="neutral"
            size="xl"
            class="rounded-none border-r border-gray-200 dark:border-gray-700 px-4 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
          />
        </UDropdownMenu>
        <UInput
          v-model="searchInput"
          class="flex-1"
          size="xl"
          :ui="{ base: 'rounded-none ring-0 shadow-none bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100' }"
          @keydown.enter="doSearch"
        >
          <template #trailing>
            <UButton
              icon="lucide:search"
              variant="ghost"
              color="neutral"
              size="sm"
              @click="doSearch"
            />
          </template>
        </UInput>
      </div>
    </div>

    <div class="flex-1 container w-[90%] md:w-[75%] mx-auto px-4">
      <slot />
    </div>
  </MainLayout>
</template>

<script setup lang="ts">
import MainLayout from '#app-ui/layouts/main.vue';
import { GAMES } from '#shared';

const router = useRouter();
const searchInput = useSearchInput();
const { t } = useI18n();

interface GameOption {
  id:   string;
  name: string;
  icon: string;
  url:  string;
}

const games = computed<GameOption[]>(() => [
  {
    id:   'omnisearch',
    name: t('omni.$self'),
    icon: 'i:logo',
    url:  '',
  },
  ...GAMES.map(g => ({
    id:   g,
    name: t(`${g}.$self`),
    icon: `i:${g}-logo`,
    url:  `https://${g}.tcg.cards`,
  })),
]);

const selectedGameId = ref<string>('omnisearch');

const selectedGame = computed(() => games.value.find(g => g.id === selectedGameId.value) ?? games.value[0]!);

const gameMenuItems = computed(() =>
  games.value.map(g => ({
    label:    g.name,
    icon:     g.icon,
    onSelect: () => { selectedGameId.value = g.id; },
  })),
);

const doSearch = () => {
  const q = searchInput.value.trim();
  if (!q) return;

  const game = selectedGame.value;

  if (game.url) {
    window.location.href = `${game.url}/search?q=${encodeURIComponent(q)}`;
  } else {
    router.push({ path: '/search', query: { q } });
  }
};
</script>
