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
  position: relative;
  min-height: 100vh;
  padding: 1rem;
  color: #eff6ff;
  background:
    radial-gradient(54rem 26rem at 76% -6%, rgb(79 141 247 / 0.22), transparent 62%),
    radial-gradient(34rem 20rem at 6% 110%, rgb(88 216 244 / 0.12), transparent 60%),
    radial-gradient(circle at 18% 24%, rgb(88 216 244 / 0.2) 0 1px, transparent 1.6px),
    radial-gradient(circle at 70% 64%, rgb(157 139 255 / 0.24) 0 1px, transparent 1.6px),
    radial-gradient(circle at 84% 12%, rgb(255 255 255 / 0.28) 0 1px, transparent 1.6px),
    radial-gradient(circle at 42% 84%, rgb(88 216 244 / 0.15) 0 1px, transparent 1.6px),
    radial-gradient(circle at 58% 36%, rgb(255 255 255 / 0.2) 0 1px, transparent 1.6px),
    linear-gradient(160deg, #0a1226 0%, #0b1330 48%, #080d1f 100%);
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
  color: rgb(214 236 255 / 0.72);
  font-size: 0.9rem;
  font-weight: 700;
}

.back-link:hover {
  color: #eff6ff;
}

.back-link.strong {
  border: 1px solid rgb(88 216 244 / 0.2);
  border-radius: 0.5rem;
  background: rgb(88 216 244 / 0.08);
  padding: 0.55rem 0.75rem;
}

@media (max-width: 52rem) {
  .advanced-page {
    padding: 0.65rem;
  }
}
</style>