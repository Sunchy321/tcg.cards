<template>
  <main class="advanced-page">
    <section class="advanced-shell">
      <header class="topbar">
        <NuxtLink to="/" class="back-link">
          <UIcon name="lucide:arrow-left" class="size-4" />
          进化对决首页
        </NuxtLink>

        <ModeSwitch />

        <NuxtLink to="/evolve/search" class="back-link strong">
          <UIcon name="lucide:search" class="size-4" />
          返回搜索
        </NuxtLink>
      </header>

      <AdvancedSearch :catalog="catalog" />
    </section>
  </main>
</template>

<script setup lang="ts">
import { cardCatalog } from '~/composables/cardCatalog';

const catalog = cardCatalog.evolve;

useHead({
  title: `${catalog.title}高级搜索 | TCG Cards`,
});
</script>

<style scoped>
.advanced-page {
  position: relative;
  min-height: 100vh;
  padding: 1rem;
  color: #edf6f2;
  background:
    linear-gradient(90deg, rgb(238 190 60 / 0.07) 1px, transparent 1px),
    linear-gradient(0deg, rgb(0 221 239 / 0.05) 1px, transparent 1px),
    radial-gradient(circle at 24% 56%, rgb(0 213 239 / 0.13), transparent 30rem),
    linear-gradient(116deg, #06090a 0%, #101719 62%, #070909 100%);
  background-size: 7rem 7rem, 7rem 7rem, auto, auto;
  background-attachment: fixed;
}

.advanced-shell {
  width: min(88rem, 100%);
  margin: 0 auto;
}

.topbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.5rem 0 0.75rem;
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  color: rgb(219 235 228 / 0.7);
  font-size: 0.9rem;
  font-weight: 700;
}

.back-link:hover {
  color: #edf6f2;
}

.back-link.strong {
  border: 1px solid rgb(81 221 234 / 0.24);
  border-radius: 0;
  background: rgb(81 221 234 / 0.07);
  padding: 0.55rem 0.75rem;
}

@media (max-width: 52rem) {
  .advanced-page {
    padding: 0.65rem;
  }
}
</style>