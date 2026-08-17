<template>
  <main class="packs-page">
    <section class="packs-shell">
      <header class="topbar">
        <NuxtLink to="/" class="back-link">
          <UIcon name="lucide:arrow-left" class="size-4" />
          超凡世界首页
        </NuxtLink>

        <ModeSwitch />

        <NuxtLink to="/beyond/search" class="advanced-link">
          <UIcon name="lucide:sliders-horizontal" class="size-4" />
          高级搜索
        </NuxtLink>
      </header>

      <section class="page-head">
        <p class="eyebrow">Card Packs</p>
        <h1>{{ catalog.packsTitle }}</h1>
        <p class="lead">
          收录 {{ catalog.packs.length }} 个扩展包。点击卡包可查看该系列详情；卡牌列表数据后续接入。
        </p>
      </section>

      <section class="packs-grid">
        <NuxtLink
          v-for="set in catalog.packs"
          :key="set.id"
          :to="`/beyond/packs/${set.id}`"
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

const catalog = cardCatalog.beyond;

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
