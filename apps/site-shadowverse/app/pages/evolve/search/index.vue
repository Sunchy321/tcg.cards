<template>
  <main class="search-page">
    <section class="search-shell">
      <header class="topbar">
        <NuxtLink to="/" class="back-link">
          <UIcon name="lucide:arrow-left" class="size-4" />
          进化对决首页
        </NuxtLink>

        <ModeSwitch />

        <NuxtLink to="/evolve/search/advanced" class="advanced-link">
          <UIcon name="lucide:sliders-horizontal" class="size-4" />
          高级搜索
        </NuxtLink>
      </header>

      <section class="search-panel">
        <div>
          <p class="eyebrow">Card Search</p>
          <h1>{{ catalog.searchTitle }}</h1>
          <p class="lead">卡牌数据尚未接入。完成第一版数据导入后，可在这里按名称、编号或效果文本检索。</p>
        </div>

        <form class="search-form" @submit.prevent="submit">
          <UInput
            v-model="input"
            size="xl"
            icon="lucide:search"
            class="search-input"
            placeholder="输入卡名、编号或效果文本"
          />
          <UButton type="submit" size="xl" icon="lucide:search" class="search-button">
            搜索
          </UButton>
        </form>
      </section>

      <section class="result-panel">
        <div class="result-header">
          <div>
            <p class="eyebrow">Results</p>
            <h2>{{ query ? '暂时无法查询' : '等待输入查询' }}</h2>
          </div>
          <span class="state-pill">待接入</span>
        </div>

        <div class="empty-state">
          <UIcon :name="query ? 'lucide:database-zap' : 'lucide:database-search'" class="empty-icon" />
          <div>
            <h2>卡牌数据尚未接入</h2>
            <p>第一版数据导入完成后，搜索结果会显示在这里。</p>
          </div>
          <NuxtLink to="/evolve/search/advanced" class="advanced-card">
            <UIcon name="lucide:sliders-horizontal" class="size-5" />
            打开高级搜索
          </NuxtLink>
        </div>
      </section>
    </section>
  </main>
</template>

<script setup lang="ts">
import { cardCatalog } from '~/composables/cardCatalog';

const catalog = cardCatalog.evolve;

const route = useRoute();
const router = useRouter();

const query = computed(() => typeof route.query.q === 'string' ? route.query.q : '');
const input = ref(query.value);

watch(query, value => {
  input.value = value;
});

useHead({
  title: `${catalog.searchTitle} | TCG Cards`,
});

const submit = async () => {
  const q = input.value.trim();

  await router.replace({
    path: '/evolve/search',
    query: q ? { q } : {},
  });
};
</script>

<style scoped>
.search-page {
  min-height: 100vh;
  padding: 1rem;
  color: #eff6ff;
}

.search-shell {
  width: min(66rem, 100%);
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
.advanced-link,
.advanced-card {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  color: rgb(239 246 255 / 0.74);
  font-size: 0.9rem;
  font-weight: 700;
}

.back-link:hover,
.advanced-link:hover {
  color: #eff6ff;
}

.advanced-link,
.advanced-card {
  border: 1px solid rgb(191 219 254 / 0.16);
  border-radius: 0.5rem;
  background: rgb(255 255 255 / 0.07);
  padding: 0.55rem 0.75rem;
}

.search-panel,
.result-panel {
  border: 1px solid rgb(191 219 254 / 0.14);
  border-radius: 0.5rem;
  background: rgb(14 20 38 / 0.9);
  box-shadow: 0 0.8rem 2rem rgb(0 0 0 / 0.2);
}

.search-panel {
  display: grid;
  grid-template-columns: minmax(0, 0.8fr) minmax(20rem, 1.2fr);
  gap: 1rem;
  align-items: end;
  padding: 1.1rem;
}

.eyebrow {
  color: rgb(147 197 253 / 0.82);
  font-size: 0.72rem;
  font-weight: 850;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

h1 {
  margin-top: 0.22rem;
  color: #eff6ff;
  font-size: 2rem;
  font-weight: 900;
  line-height: 1.08;
}

.lead {
  max-width: 34rem;
  margin-top: 0.5rem;
  color: rgb(239 246 255 / 0.66);
  font-size: 0.95rem;
  line-height: 1.7;
}

.search-form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.55rem;
}

.search-input {
  min-width: 0;
}

.search-button {
  justify-content: center;
}

.result-panel {
  margin-top: 0.75rem;
  padding: 1rem;
}

.result-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.result-header h2,
.empty-state h2 {
  margin-top: 0.18rem;
  font-size: 1.25rem;
  font-weight: 850;
}

.state-pill {
  flex-shrink: 0;
  border: 1px solid rgb(251 191 36 / 0.26);
  border-radius: 9999px;
  background: rgb(251 191 36 / 0.08);
  padding: 0.28rem 0.65rem;
  color: #fde68a;
  font-size: 0.78rem;
  font-weight: 800;
}

.empty-state {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 1rem;
  margin-top: 0.9rem;
  border: 1px dashed rgb(191 219 254 / 0.18);
  border-radius: 0.5rem;
  background: rgb(15 23 42 / 0.38);
  padding: 1rem;
}

.empty-icon {
  width: 2.4rem;
  height: 2.4rem;
  color: #93c5fd;
}

.empty-state p {
  max-width: 42rem;
  color: rgb(239 246 255 / 0.62);
  line-height: 1.7;
}

@media (max-width: 52rem) {
  .search-panel,
  .search-form,
  .empty-state {
    grid-template-columns: 1fr;
  }
}
</style>
