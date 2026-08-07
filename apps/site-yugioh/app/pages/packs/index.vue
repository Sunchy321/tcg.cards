<template>
  <main class="packs-page">
    <section class="packs-shell">
      <header class="topbar">
        <NuxtLink to="/" class="back-link">
          <UIcon name="lucide:arrow-left" class="size-4" />
          游戏王首页
        </NuxtLink>

        <NuxtLink to="/search/advanced" class="advanced-link">
          <UIcon name="lucide:sliders-horizontal" class="size-4" />
          高级搜索
        </NuxtLink>
      </header>

      <section class="page-head">
        <p class="eyebrow">Card Packs</p>
        <h1>游戏王卡包列表</h1>
        <p class="lead">
          收录 {{ sets.length }} 个卡包，分为 OCG 与 TCG 两个分区。点击卡包可查看该卡包详情；卡牌列表数据后续接入。
        </p>
      </section>

      <nav class="region-tabs" aria-label="卡包分区">
        <button
          v-for="tab in tabs"
          :key="tab.region"
          type="button"
          class="region-tab"
          :class="{ active: activeRegion === tab.region }"
          @click="activeRegion = tab.region"
        >
          {{ tab.label }}
          <span class="region-count">{{ tab.count }}</span>
        </button>
      </nav>

      <section class="packs-grid">
        <NuxtLink
          v-for="set in visibleSets"
          :key="set.id"
          :to="`/packs/${set.id}`"
          class="pack-card"
        >
          <span class="pack-name">{{ set.name }}</span>
          <span class="pack-meta">
            <span class="pack-code">{{ set.code ?? '—' }}</span>
            <span class="pack-count">{{ set.cardCount }} 张</span>
          </span>
        </NuxtLink>
      </section>
    </section>
  </main>
</template>

<script setup lang="ts">
import yugiohSets from '~/data/yugioh-sets.json';

const sets = yugiohSets;

type Region = 'ocg' | 'tcg';

const activeRegion = ref<Region>('ocg');

const tabs = computed(() => [
  { region: 'ocg' as const, label: 'OCG', count: sets.filter(set => set.region === 'ocg').length },
  { region: 'tcg' as const, label: 'TCG', count: sets.filter(set => set.region === 'tcg').length },
]);

const visibleSets = computed(() => sets.filter(set => set.region === activeRegion.value));

useHead({
  title: 'Yu-Gi-Oh! Packs | TCG Cards',
});
</script>

<style scoped>
.packs-page {
  min-height: 100vh;
  padding: 1rem;
  color: #fff7ed;
}

.packs-shell {
  width: min(70rem, 100%);
  margin: 0 auto;
}

.topbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 1rem 0;
}

.back-link,
.advanced-link {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  color: rgb(255 247 237 / 0.74);
  font-size: 0.9rem;
  font-weight: 700;
}

.back-link:hover {
  color: #fff7ed;
}

.advanced-link {
  border: 1px solid rgb(254 215 170 / 0.16);
  border-radius: 0.5rem;
  background: rgb(255 255 255 / 0.07);
  padding: 0.55rem 0.75rem;
}

.page-head {
  padding: 0.4rem 0 1.1rem;
}

.eyebrow {
  color: rgb(253 186 116 / 0.82);
  font-size: 0.72rem;
  font-weight: 850;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.page-head h1 {
  margin-top: 0.22rem;
  color: #fff7ed;
  font-size: 2rem;
  font-weight: 900;
  line-height: 1.08;
}

.lead {
  max-width: 42rem;
  margin-top: 0.5rem;
  color: rgb(255 247 237 / 0.66);
  font-size: 0.95rem;
  line-height: 1.7;
}

.region-tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.region-tab {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  border: 1px solid rgb(254 215 170 / 0.14);
  border-radius: 0.5rem;
  background: rgb(255 255 255 / 0.06);
  padding: 0.5rem 0.85rem;
  color: rgb(255 247 237 / 0.66);
  font-size: 0.9rem;
  font-weight: 800;
  cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease, color 0.2s ease;
}

.region-tab:hover {
  border-color: rgb(254 215 170 / 0.35);
  color: #fff7ed;
}

.region-tab.active {
  border-color: rgb(251 191 36 / 0.45);
  background: rgb(251 191 36 / 0.12);
  color: #fde68a;
}

.region-count {
  border-radius: 9999px;
  background: rgb(255 255 255 / 0.1);
  padding: 0.05rem 0.45rem;
  font-size: 0.72rem;
  font-weight: 750;
}

.region-tab.active .region-count {
  background: rgb(251 191 36 / 0.2);
}

.packs-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
  gap: 0.85rem;
}

.pack-card {
  display: flex;
  min-height: 6.25rem;
  flex-direction: column;
  justify-content: space-between;
  gap: 0.75rem;
  border-radius: 0.5rem;
  border: 1px solid rgb(254 215 170 / 0.14);
  background: rgb(255 255 255 / 0.06);
  padding: 0.9rem 1rem;
  color: #fff7ed;
  transition: border-color 0.2s ease, background 0.2s ease, transform 0.2s ease;
}

.pack-card:hover {
  transform: translateY(-1px);
  border-color: rgb(254 215 170 / 0.4);
  background: rgb(255 255 255 / 0.1);
}

.pack-name {
  color: inherit;
  font-size: 1.02rem;
  font-weight: 700;
  line-height: 1.35;
}

.pack-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  color: rgb(255 247 237 / 0.62);
  font-size: 0.82rem;
  font-weight: 650;
}

.pack-code {
  font-family: ui-monospace, monospace;
  letter-spacing: 0.04em;
}

.pack-count {
  flex-shrink: 0;
}

@media (max-width: 52rem) {
  .packs-page {
    padding: 0.65rem;
  }
}
</style>
