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

      <div class="mode-switch" :class="{ 'is-evolve': mode === 'evolve' }" role="group" aria-label="游戏模式">
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

      <template v-if="isBeyond">
        <div class="brand">
          <img
            src="/logo/shadowverse_worlds_beyond_logo.png"
            alt="影之诗：超凡世界"
            class="brand-logo"
          >
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
      </template>

      <section v-else class="evolve-landing">
        <div class="evolve-logo-plane">
          <div class="evolve-card-scene" aria-hidden="true">
            <img src="/card/evolve/bp21-001.png" alt="" class="evolve-card card-one">
            <img src="/card/evolve/bp21-002.png" alt="" class="evolve-card card-two">
            <img src="/card/evolve/bp21-003.png" alt="" class="evolve-card card-three">
          </div>
          <img
            src="/logo/shadowverse-evolve-logo.png"
            alt="Shadowverse Evolve"
            class="evolve-logo"
          >
        </div>

        <div class="evolve-panel">
          <form class="search-form evolve-search" @submit.prevent="goSearch">
            <UInput
              v-model="query"
              size="xl"
              icon="lucide:search"
              class="flex-1"
              placeholder="输入卡名、编号或效果文本"
            />
            <UButton type="submit" size="xl" icon="lucide:search" class="justify-center">
              搜索
            </UButton>
          </form>

          <nav class="evolve-navigation" aria-label="进化对决功能入口">
            <NuxtLink
              v-for="(item, index) in entries"
              :key="item.to"
              class="evolve-entry"
              :to="item.to"
            >
              <span>0{{ index + 1 }}</span>
              <span>{{ item.label }}</span>
              <UIcon :name="item.icon" class="size-4" />
            </NuxtLink>
          </nav>
        </div>
      </section>
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

  return mode.value === 'evolve'
    ? [
        { label: '卡牌检索', icon: 'lucide:search', to: `${base}/search` },
        { label: '卡包列表', icon: 'lucide:layers-3', to: `${base}/packs` },
        { label: '高级筛选', icon: 'lucide:sliders-horizontal', to: `${base}/search/advanced` },
      ]
    : [
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
  position: relative;
  display: inline-grid;
  grid-template-columns: repeat(2, minmax(5.8rem, 1fr));
  align-items: center;
  gap: 0.25rem;
  border: 1px solid rgb(255 255 255 / 0.16);
  border-radius: 9999px;
  background: rgb(255 255 255 / 0.07);
  padding: 0.25rem;
}

.mode-switch::before {
  position: absolute;
  top: 0.25rem;
  bottom: 0.25rem;
  left: 0.25rem;
  width: calc((100% - 0.75rem) / 2);
  border-radius: 9999px;
  background: var(--mode-accent-600);
  content: '';
  transition: transform 0.28s cubic-bezier(0.22, 1, 0.36, 1), background 0.2s ease;
}

.mode-switch.is-evolve::before {
  transform: translateX(calc(100% + 0.25rem));
}

.mode-switch-option {
  position: relative;
  z-index: 1;
  display: inline-flex;
  justify-content: center;
  align-items: center;
  gap: 0.35rem;
  border-radius: 9999px;
  padding: 0.42rem 0.9rem;
  color: rgb(255 255 255 / 0.72);
  font-size: 0.86rem;
  font-weight: 750;
  transition: color 0.2s ease;
  cursor: pointer;
}

.mode-switch-option:hover {
  color: #fff;
}

.mode-switch-option.active {
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
  width: min(28rem, 88vw);
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

.home.beyond .stage {
  margin-top: 0.8rem;
}

.home.beyond .search-form,
.home.beyond .entries {
  transform: translateY(-1.25rem);
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

/* ===== Evolve：非对称入口页 ===== */

.home.evolve .stage-glow {
  background:
    linear-gradient(90deg, rgb(238 190 60 / 0.1) 1px, transparent 1px),
    linear-gradient(0deg, rgb(0 221 239 / 0.06) 1px, transparent 1px);
  background-size: 7rem 7rem;
}

.home.evolve {
  --mode-accent-600: #ba8517;
  background:
    radial-gradient(circle at 25% 58%, rgb(0 213 239 / 0.12), transparent 32rem),
    linear-gradient(116deg, #06090a 0%, #101719 62%, #070909 100%);
}

.home.evolve .stage {
  display: block;
  padding: 1.5rem 0 0;
}

.evolve-landing {
  position: relative;
  z-index: 2;
  display: grid;
  width: min(78rem, 100%);
  min-height: min(43rem, calc(100vh - 8rem));
  grid-template-columns: minmax(0, 1.45fr) minmax(20rem, 0.55fr);
  align-items: stretch;
  margin: 0 auto;
}

.evolve-logo-plane {
  position: relative;
  display: grid;
  min-height: 28rem;
  align-items: center;
  overflow: hidden;
  padding: 2rem clamp(1rem, 4vw, 4rem) 2rem 0;
}

.evolve-logo-plane::before,
.evolve-logo-plane::after {
  position: absolute;
  content: '';
}

.evolve-logo-plane::before {
  top: 8%;
  bottom: 8%;
  left: 0;
  width: 1px;
  background: linear-gradient(transparent, rgb(239 193 70 / 0.78), transparent);
}

.evolve-logo-plane::after {
  right: 7%;
  bottom: 16%;
  width: 8.5rem;
  height: 8.5rem;
  border: 1px solid rgb(0 221 239 / 0.3);
  border-radius: 50%;
}

.evolve-card-scene {
  position: absolute;
  inset: 0;
}

.evolve-card {
  position: absolute;
  width: clamp(9rem, 17vw, 13rem);
  border-radius: 0.35rem;
  filter: saturate(0.82) contrast(0.92);
  opacity: 0.38;
  box-shadow: 0 1.2rem 2rem rgb(0 0 0 / 0.48);
}

.card-one {
  top: 17%;
  left: -3%;
  transform: rotate(-16deg);
}

.card-two {
  top: 6%;
  left: 34%;
  z-index: 1;
  opacity: 0.55;
  transform: rotate(-2deg);
}

.card-three {
  right: -1%;
  bottom: 8%;
  transform: rotate(14deg);
}

.evolve-logo {
  position: relative;
  z-index: 2;
  width: min(50rem, 112%);
  height: auto;
  margin-left: -5%;
  filter: drop-shadow(0 1.5rem 2.5rem rgb(0 0 0 / 0.54));
}

.evolve-panel {
  display: grid;
  align-content: center;
  gap: 1.75rem;
  border-left: 1px solid rgb(224 233 226 / 0.2);
  padding: 2.5rem 0 2.5rem clamp(1.25rem, 3vw, 3rem);
}

.home.evolve .evolve-search {
  width: 100%;
  border-bottom: 1px solid rgb(238 190 60 / 0.65);
  padding-bottom: 0.7rem;
}

.evolve-navigation {
  display: grid;
  border-top: 1px solid rgb(224 233 226 / 0.2);
}

.evolve-entry {
  display: grid;
  min-height: 4.4rem;
  grid-template-columns: 2rem minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.65rem;
  border-bottom: 1px solid rgb(224 233 226 / 0.2);
  color: rgb(234 239 232 / 0.78);
  font-size: 1rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  transition: background 0.2s ease, color 0.2s ease, padding 0.2s ease;
}

.evolve-entry > span:first-child {
  color: rgb(243 197 78 / 0.68);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.68rem;
  letter-spacing: 0.12em;
}

.evolve-entry :last-child {
  color: #40dce8;
}

.evolve-entry:hover {
  background: rgb(255 255 255 / 0.055);
  color: #fff;
  padding-left: 0.55rem;
}

@media (max-width: 40rem) {
  .evolve-landing {
    grid-template-columns: 1fr;
    min-height: 0;
  }

  .evolve-logo-plane {
    min-height: 20rem;
    padding-right: 1rem;
  }

  .evolve-logo-plane::after {
    right: 8%;
    width: 5rem;
    height: 5rem;
  }

  .evolve-card {
    width: 9rem;
    opacity: 0.24;
  }

  .card-two {
    left: 33%;
    opacity: 0.42;
  }

  .evolve-panel {
    padding: 1.5rem 0 0;
    border-top: 1px solid rgb(224 233 226 / 0.2);
    border-left: 0;
  }
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
