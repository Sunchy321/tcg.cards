<template>
  <main class="card-page">
    <section class="card-shell">
      <header class="topbar">
        <NuxtLink to="/evolve/search" class="back-link">
          <UIcon name="lucide:arrow-left" class="size-4" />
          返回搜索
        </NuxtLink>
      </header>

      <section class="empty-state">
        <UIcon name="lucide:database" class="empty-icon" />
        <div>
          <p class="eyebrow">Card Data Pending</p>
          <h1>进化对决卡牌数据尚未接入</h1>
          <p>当前无法读取 #{{ cardId }} 的详情。完成第一版数据导入后，这里会显示对应卡牌。</p>
        </div>
        <NuxtLink to="/evolve/search" class="back-link strong">
          返回卡牌搜索
          <UIcon name="lucide:arrow-right" class="size-4" />
        </NuxtLink>
      </section>
    </section>
  </main>
</template>

<script setup lang="ts">
const route = useRoute();
const cardId = computed(() => String(route.params.id ?? ''));

useHead({
  title: '进化对决卡牌数据待接入 | TCG Cards',
});
</script>

<style scoped>
.card-page {
  min-height: 100vh;
  padding: 1rem;
  color: #eff6ff;
}

.card-shell {
  width: min(66rem, 100%);
  margin: 0 auto;
}

.topbar {
  display: flex;
  align-items: center;
  padding: 1rem 0;
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  color: rgb(239 246 255 / 0.74);
  font-size: 0.9rem;
  font-weight: 750;
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

.empty-state {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 1rem;
  border: 1px solid rgb(191 219 254 / 0.14);
  border-radius: 0.5rem;
  background: rgb(14 20 38 / 0.9);
  padding: 1rem;
  box-shadow: 0 0.8rem 2rem rgb(0 0 0 / 0.2);
}

.empty-icon {
  width: 2.5rem;
  height: 2.5rem;
  color: #93c5fd;
}

.eyebrow {
  color: rgb(147 197 253 / 0.82);
  font-size: 0.72rem;
  font-weight: 850;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

h1 {
  margin-top: 0.2rem;
  color: #eff6ff;
  font-size: 2rem;
  font-weight: 950;
  line-height: 1.08;
}

.empty-state p:last-child {
  margin-top: 0.35rem;
  color: rgb(239 246 255 / 0.62);
  line-height: 1.65;
}

@media (max-width: 52rem) {
  .card-page {
    padding: 0.65rem;
  }

  .empty-state {
    grid-template-columns: 1fr;
  }
}
</style>
