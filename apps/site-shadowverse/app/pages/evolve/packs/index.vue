<template>
  <main class="packs-page">
    <section class="packs-shell">
      <header class="topbar">
        <NuxtLink to="/" class="back-link">
          <UIcon name="lucide:arrow-left" class="size-4" />
          进化对决首页
        </NuxtLink>

        <ModeSwitch />

        <NuxtLink to="/evolve/search" class="advanced-link">
          <UIcon name="lucide:sliders-horizontal" class="size-4" />
          高级搜索
        </NuxtLink>
      </header>

      <section class="page-head">
        <p class="eyebrow">Card Packs</p>
        <h1>{{ catalog.packsTitle }}</h1>
        <p class="lead">
          收录 {{ catalog.packs.length }} 个系列，覆盖补充包、联动包与预组。点击卡包可查看该系列详情；卡牌列表数据后续接入。
        </p>
      </section>

      <nav class="region-tabs" aria-label="卡包分区">
        <button
          v-for="tab in tabs"
          :key="tab.group"
          type="button"
          class="region-tab"
          :class="{ active: activeGroup === tab.group }"
          @click="activeGroup = tab.group"
        >
          {{ tab.label }}
          <span class="region-count">{{ tab.count }}</span>
        </button>
      </nav>

      <section class="packs-grid">
        <NuxtLink
          v-for="set in visibleSets"
          :key="set.id"
          :to="`/evolve/packs/${set.id}`"
          class="pack-card"
        >
          <span class="pack-name">{{ set.name }}</span>
          <span class="pack-meta">
            <span class="pack-code">{{ set.code }}</span>
            <span class="pack-count">{{ set.cardCount }} 张</span>
          </span>
        </NuxtLink>
      </section>
    </section>
  </main>
</template>

<script setup lang="ts">
import { cardCatalog } from '~/composables/cardCatalog';

const catalog = cardCatalog.evolve;

const groupLabel: Record<string, string> = {
  BP: '补充包',
  CP: '联动包',
  ECP: '扩展包',
  ETD: '预组包',
  SD: '预组包',
  PCS: '特别包',
  SP: '特别包',
  CSD: '特典包',
  DSD: '特典包',
};

function groupOf(code: string): string {
  const prefix = Object.keys(groupLabel).find(prefix => code.startsWith(prefix));
  return prefix ?? '其他';
}

const activeGroup = ref('BP');

const tabs = computed(() => {
  const counts = new Map<string, number>();

  for (const set of catalog.packs) {
    const group = groupOf(set.code);
    counts.set(group, (counts.get(group) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([group, count]) => ({
      group,
      label: groupLabel[group] ?? group,
      count,
    }));
});

const visibleSets = computed(() =>
  catalog.packs.filter(set => groupOf(set.code) === activeGroup.value),
);

useHead({
  title: `${catalog.packsTitle} | TCG Cards`,
});
</script>

<style scoped>
.packs-page {
  min-height: 100vh;
  padding: 1rem;
  color: #eff6ff;
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
  color: rgb(239 246 255 / 0.74);
  font-size: 0.9rem;
  font-weight: 700;
}

.back-link:hover {
  color: #eff6ff;
}

.advanced-link {
  border: 1px solid rgb(191 219 254 / 0.16);
  border-radius: 0.5rem;
  background: rgb(255 255 255 / 0.07);
  padding: 0.55rem 0.75rem;
}

.page-head {
  padding: 0.4rem 0 1.1rem;
}

.eyebrow {
  color: rgb(147 197 253 / 0.82);
  font-size: 0.72rem;
  font-weight: 850;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.page-head h1 {
  margin-top: 0.22rem;
  color: #eff6ff;
  font-size: 2rem;
  font-weight: 900;
  line-height: 1.08;
}

.lead {
  max-width: 42rem;
  margin-top: 0.5rem;
  color: rgb(239 246 255 / 0.66);
  font-size: 0.95rem;
  line-height: 1.7;
}

.region-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.region-tab {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  border: 1px solid rgb(191 219 254 / 0.14);
  border-radius: 0.5rem;
  background: rgb(255 255 255 / 0.06);
  padding: 0.5rem 0.85rem;
  color: rgb(239 246 255 / 0.66);
  font-size: 0.9rem;
  font-weight: 800;
  cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease, color 0.2s ease;
}

.region-tab:hover {
  border-color: rgb(191 219 254 / 0.35);
  color: #eff6ff;
}

.region-tab.active {
  border-color: rgb(96 165 250 / 0.45);
  background: rgb(96 165 250 / 0.12);
  color: #bfdbfe;
}

.region-count {
  border-radius: 9999px;
  background: rgb(255 255 255 / 0.1);
  padding: 0.05rem 0.45rem;
  font-size: 0.72rem;
  font-weight: 750;
}

.region-tab.active .region-count {
  background: rgb(96 165 250 / 0.2);
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
  border: 1px solid rgb(191 219 254 / 0.14);
  background: rgb(255 255 255 / 0.06);
  padding: 0.9rem 1rem;
  color: #eff6ff;
  transition: border-color 0.2s ease, background 0.2s ease, transform 0.2s ease;
}

.pack-card:hover {
  transform: translateY(-1px);
  border-color: rgb(191 219 254 / 0.4);
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
  color: rgb(239 246 255 / 0.62);
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
