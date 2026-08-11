<template>
  <main class="advanced-page">
    <section class="advanced-shell">
      <header class="topbar">
        <NuxtLink to="/" class="back-link">
          <UIcon name="lucide:arrow-left" class="size-4" />
          超凡世界首页
        </NuxtLink>

        <ModeSwitch />

        <NuxtLink to="/beyond/search" class="back-link strong">
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

const catalog = cardCatalog.beyond;

useHead({
  title: `${catalog.title}高级搜索 | TCG Cards`,
});
</script>

<style scoped>
.advanced-page {
  min-height: 100vh;
  padding: 1rem;
  color: #eff6ff;
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
  color: rgb(239 246 255 / 0.74);
  font-size: 0.9rem;
  font-weight: 700;
}

.back-link:hover {
  color: #eff6ff;
}

.back-link.strong {
  border: 1px solid rgb(191 219 254 / 0.16);
  border-radius: 0.5rem;
  background: rgb(255 255 255 / 0.07);
  padding: 0.55rem 0.75rem;
}

@media (max-width: 52rem) {
  .advanced-page {
    padding: 0.65rem;
  }
}
</style>
