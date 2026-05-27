<template>
  <main class="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-4 py-8">
    <header class="flex items-center justify-between gap-4">
      <NuxtLink
        :to="mainSiteUrl"
        external
        class="inline-flex items-center gap-2 text-sm text-white/70 hover:text-white"
      >
        <UIcon name="lucide:arrow-left" class="size-4" />
        TCG Cards
      </NuxtLink>

      <div class="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-sm text-white/80">
        <UIcon name="lucide:layers-3" class="size-4" />
        Yu-Gi-Oh!
      </div>
    </header>

    <section class="grid flex-1 items-center gap-8 md:grid-cols-[1.16fr_0.84fr]">
      <div class="space-y-5">
        <div class="space-y-3">
          <p class="text-sm font-medium uppercase tracking-[0.24em] text-orange-200/80">
            Yu-Gi-Oh! OCG
          </p>
          <h1 class="max-w-3xl text-4xl font-bold leading-tight text-white md:text-5xl">
            游戏王卡牌资料库
          </h1>
          <p class="max-w-2xl text-lg leading-8 text-white/72">
            先把站点入口和页面骨架搭起来。数据导入、卡牌详情和筛选功能后续再逐步接上。
          </p>
        </div>

        <form class="flex max-w-2xl flex-col gap-3 sm:flex-row" @submit.prevent="goSearch">
          <UInput
            v-model="query"
            size="xl"
            icon="lucide:search"
            class="flex-1"
            placeholder="输入卡名或效果文本"
          />
          <UButton
            type="submit"
            size="xl"
            icon="lucide:search"
            class="justify-center"
          >
            搜索
          </UButton>
        </form>

        <div class="grid max-w-3xl gap-4 sm:grid-cols-2">
          <NuxtLink
            v-for="item in entries"
            :key="item.to"
            class="entry-card"
            :to="item.to"
          >
            <UIcon :name="item.icon" class="entry-icon" />
            <span class="entry-label">{{ item.label }}</span>
          </NuxtLink>
        </div>
      </div>

      <div class="relative min-h-80 overflow-hidden rounded-lg border border-orange-200/20 bg-black/24 p-8 shadow-2xl">
        <div class="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(251,146,60,0.24),transparent_18rem)]" />
        <div class="relative flex h-full flex-col justify-between gap-8">
          <div class="flex justify-end">
            <UIcon name="lucide:layers-3" class="size-20 text-orange-100" />
          </div>
          <div class="space-y-3">
            <div class="text-sm uppercase tracking-[0.2em] text-orange-200/70">
              Next
            </div>
            <div class="text-2xl font-semibold text-white">
              数据、卡图、规则文本
            </div>
            <p class="leading-7 text-white/68">
              下一步会逐步接入卡牌数据源、搜索 DSL、卡包与禁限表。
            </p>
          </div>
        </div>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
const query = ref('');
const { public: { mainSiteUrl } } = useRuntimeConfig();

const entries = [
  { label: '高级搜索', icon: 'lucide:sliders-horizontal', to: '/search/advanced' },
  { label: '卡包列表', icon: 'lucide:layers-3', to: '/packs' },
  { label: '禁限一览', icon: 'lucide:scroll-text', to: '/banlist' },
  { label: '随机卡牌', icon: 'lucide:shuffle', to: '/random' },
];

useHead({
  title: 'Yu-Gi-Oh! | TCG Cards',
});

const goSearch = async () => {
  const q = query.value.trim();

  await navigateTo({
    path:  '/search',
    query: q ? { q } : {},
  });
};
</script>

<style scoped>
.entry-card {
  display: flex;
  min-height: 5.75rem;
  align-items: center;
  gap: 1.35rem;
  border-radius: 0.75rem;
  border: 1px solid rgb(254 215 170 / 0.18);
  background: rgb(255 255 255 / 0.075);
  padding: 0 1.5rem;
  color: white;
  transition: transform 0.2s ease, background 0.2s ease, border-color 0.2s ease;
}

.entry-card:hover {
  transform: translateY(-1px);
  border-color: rgb(254 215 170 / 0.38);
  background: rgb(255 255 255 / 0.12);
}

.entry-icon {
  flex-shrink: 0;
  width: 1.85rem;
  height: 1.85rem;
  color: rgb(254 215 170);
}

.entry-label {
  min-width: 0;
  font-size: 1.375rem;
  font-weight: 700;
  line-height: 1.2;
  color: rgb(255 247 237);
}
</style>
