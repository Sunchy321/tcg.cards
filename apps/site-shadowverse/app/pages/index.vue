<template>
  <main class="home" :class="mode">
    <header class="home-header">
      <NuxtLink
        :to="mainSiteUrl"
        external
        class="back-link"
      >
        <UIcon name="lucide:arrow-left" class="size-4" />
        TCG Cards
      </NuxtLink>

      <div class="mode-switch" role="group" aria-label="游戏模式">
        <button
          v-for="item in gameModeKeys"
          :key="item"
          type="button"
          class="mode-switch-option"
          :class="{ active: mode === item }"
          @click="setMode(item)"
        >
          <UIcon :name="gameModes[item].icon" class="size-4" />
          {{ gameModes[item].name }}
        </button>
      </div>
    </header>

    <section class="stage">
      <div class="stage-glow" aria-hidden="true" />

      <template v-if="isBeyond">
        <img
          src="/logo/shadowverse_worlds_beyond_Eudie.jpg"
          alt=""
          class="stage-wallpaper"
          aria-hidden="true"
        >
        <div class="stage-veil" aria-hidden="true" />
      </template>

      <div class="brand">
        <template v-if="isBeyond">
          <img
            src="/logo/shadowverse_worlds_beyond_logo.png"
            alt="影之诗：超凡世界"
            class="brand-logo"
          >
        </template>
        <template v-else>
          <div class="brand-icon-wrap">
            <UIcon :name="current.icon" class="brand-icon" />
          </div>
          <p class="brand-subtitle">{{ current.subtitle }}</p>
          <h1 class="brand-title">{{ current.title }}</h1>
        </template>
      </div>

      <form class="search-form" @submit.prevent="goSearch">
        <UInput
          v-model="query"
          size="xl"
          icon="lucide:search"
          class="flex-1"
          placeholder="输入卡名、编号或效果文本"
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

      <div class="entries">
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
    </section>
  </main>
</template>

<script setup lang="ts">
import { gameModeKeys, gameModes } from '~/composables/gameModes';

const query = ref('');
const { public: { mainSiteUrl } } = useRuntimeConfig();

const { mode, current, isBeyond, setMode } = useGameMode();

const entries = computed(() => {
  const base = `/${mode.value}`;

  return [
    { label: '高级搜索', icon: 'lucide:sliders-horizontal', to: `${base}/search/advanced` },
    { label: '卡包列表', icon: 'lucide:layers-3', to: `${base}/packs` },
    { label: '卡牌检索', icon: 'lucide:search', to: `${base}/search` },
  ];
});

useHead({
  title: `${current.value.title} | TCG Cards`,
});

const goSearch = async () => {
  const q = query.value.trim();

  await navigateTo({
    path:  `/${mode.value}/search`,
    query: q ? { q } : {},
  });
};
</script>

<style scoped>
.home {
  position: relative;
  display: flex;
  min-height: 100vh;
  flex-direction: column;
  overflow: hidden;
  padding: 1.5rem 2rem 3rem;
}

.home-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  color: rgb(239 246 255 / 0.72);
  font-size: 0.9rem;
  font-weight: 750;
  transition: color 0.2s ease;
}

.back-link:hover {
  color: #fff;
}

.mode-switch {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  border: 1px solid rgb(255 255 255 / 0.16);
  border-radius: 9999px;
  background: rgb(255 255 255 / 0.07);
  padding: 0.25rem;
}

.mode-switch-option {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  border-radius: 9999px;
  padding: 0.42rem 0.9rem;
  color: rgb(255 255 255 / 0.72);
  font-size: 0.86rem;
  font-weight: 750;
  transition: background 0.2s ease, color 0.2s ease;
  cursor: pointer;
}

.mode-switch-option:hover {
  color: #fff;
}

.mode-switch-option.active {
  background: var(--mode-accent-600);
  color: #fff;
}

.stage {
  position: relative;
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2.2rem;
  padding: 2rem 0;
}

.stage-glow {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.stage-wallpaper {
  position: absolute;
  inset: 0;
  z-index: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
  pointer-events: none;
}

.stage-veil {
  position: absolute;
  inset: 0;
  z-index: 1;
  background:
    linear-gradient(180deg, rgb(6 18 30 / 0.62) 0%, rgb(6 18 30 / 0.42) 42%, rgb(6 12 22 / 0.85) 100%);
  pointer-events: none;
}

.brand {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.85rem;
  text-align: center;
}

.brand-logo {
  width: min(22rem, 82vw);
  height: auto;
  filter: drop-shadow(0 0.4rem 1.6rem rgb(0 0 0 / 0.5));
}

.brand-icon-wrap {
  display: flex;
  width: 5.5rem;
  height: 5.5rem;
  align-items: center;
  justify-content: center;
  border-radius: 1.25rem;
}

.brand-icon {
  width: 3rem;
  height: 3rem;
}

.brand-subtitle {
  font-size: 0.85rem;
  font-weight: 850;
  letter-spacing: 0.26em;
  text-transform: uppercase;
}

.brand-title {
  font-size: clamp(2.4rem, 6vw, 4rem);
  font-weight: 900;
  line-height: 1.05;
}

.search-form {
  position: relative;
  z-index: 2;
  display: grid;
  width: min(42rem, 100%);
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.6rem;
}

.entries {
  position: relative;
  z-index: 2;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.8rem;
}

.entry-card {
  display: flex;
  min-width: 11rem;
  min-height: 4rem;
  align-items: center;
  justify-content: center;
  gap: 0.7rem;
  border-radius: 0.65rem;
  padding: 0 1.2rem;
  color: #fff;
  transition: transform 0.2s ease, border-color 0.2s ease, background 0.2s ease;
}

.entry-card:hover {
  transform: translateY(-2px);
}

.entry-icon {
  flex-shrink: 0;
  width: 1.3rem;
  height: 1.3rem;
}

.entry-label {
  font-size: 1rem;
  font-weight: 750;
  white-space: nowrap;
}

/* ===== Beyond：官方站夜空辉光氛围 ===== */

.home.beyond .stage-glow {
  background:
    radial-gradient(40rem 24rem at 50% 12%, rgb(34 211 238 / 0.14), transparent 62%),
    radial-gradient(30rem 20rem at 8% 92%, rgb(59 130 246 / 0.1), transparent 60%);
}

.home.beyond .brand-icon-wrap {
  background: linear-gradient(165deg, rgb(8 51 68 / 0.72), rgb(6 27 40 / 0.5));
  border: 1px solid rgb(103 232 249 / 0.3);
  box-shadow: 0 0 2.4rem rgb(34 211 238 / 0.28);
}

.home.beyond .brand-icon {
  color: #67e8f9;
  filter: drop-shadow(0 0 1.1rem rgb(34 211 238 / 0.75));
}

.home.beyond .brand-subtitle {
  color: rgb(103 232 249 / 0.85);
}

.home.beyond .brand-title {
  color: #f0fdff;
  text-shadow: 0 0 2.2rem rgb(34 211 238 / 0.55);
}

.home.beyond .entry-card {
  border: 1px solid rgb(255 255 255 / 0.22);
  background: rgb(8 20 34 / 0.5);
  backdrop-filter: blur(6px);
}

.home.beyond .entry-card:hover {
  border-color: rgb(103 232 249 / 0.55);
  background: rgb(8 20 34 / 0.68);
}

.home.beyond .entry-icon {
  color: #67e8f9;
}

/* ===== Evolve：卡框主题 ===== */

.home.evolve .stage-glow {
  background:
    radial-gradient(38rem 24rem at 50% 10%, rgb(96 165 250 / 0.16), transparent 60%),
    radial-gradient(28rem 20rem at 10% 92%, rgb(37 99 235 / 0.14), transparent 58%);
}

.home.evolve .brand-icon-wrap {
  border: 2px solid rgb(147 197 253 / 0.45);
  background: linear-gradient(165deg, rgb(23 37 84 / 0.7), rgb(10 16 32 / 0.5));
  box-shadow: 0 0 0 1px rgb(147 197 253 / 0.2), 0 0 1.8rem rgb(59 130 246 / 0.22);
}

.home.evolve .brand-icon {
  color: #93c5fd;
}

.home.evolve .brand-subtitle {
  color: rgb(147 197 253 / 0.82);
}

.home.evolve .brand-title {
  color: #f5f8ff;
  text-shadow: 0 0 1.8rem rgb(59 130 246 / 0.4);
}

.home.evolve .entry-card {
  border: 1px solid rgb(147 197 253 / 0.2);
  background: linear-gradient(160deg, rgb(23 37 84 / 0.5), rgb(15 23 42 / 0.32));
}

.home.evolve .entry-card:hover {
  border-color: rgb(147 197 253 / 0.5);
  background: linear-gradient(160deg, rgb(23 37 84 / 0.7), rgb(15 23 42 / 0.5));
}

.home.evolve .entry-icon {
  color: #93c5fd;
}

@media (max-width: 40rem) {
  .home {
    padding: 1rem;
  }

  .entries {
    flex-direction: column;
    width: 100%;
  }

  .entry-card {
    width: 100%;
  }

  .search-form {
    grid-template-columns: 1fr;
  }
}
</style>
