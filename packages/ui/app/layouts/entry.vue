<template>
  <MainLayout>
    <div class="flex items-center justify-center">
      <UInput
        v-model="searchInput"
        class="w-[90%] md:w-[75%] mt-50 text-black bg-white rounded-md shadow-[0_20px_60px_rgba(0,0,0,0.3)] overflow-hidden"
        size="xl"
        @keydown.enter="doSearch"
      >
        <template #trailing>
          <UButton
            icon="tabler:search"
            variant="ghost"
            color="neutral"
            size="sm"
            @click="doSearch"
          />
        </template>
      </UInput>
    </div>

    <div class="flex-1 container mx-auto px-4">
      <slot />
    </div>
  </MainLayout>
</template>

<script setup lang="ts">
import MainLayout from './main.vue';

const router = useRouter();
const game = useGame();
const searchInput = useSearchInput();

const doSearch = () => {
  const q = searchInput.value.trim();
  if (!q) return;

  if (game.value) {
    router.push({ path: `/${game.value}/search`, query: { q } });
  }
};
</script>
