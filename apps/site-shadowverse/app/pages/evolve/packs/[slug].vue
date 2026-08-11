<template>
  <main class="pack-page">
    <section class="pack-shell">
      <header class="topbar">
        <NuxtLink to="/evolve/packs" class="back-link">
          <UIcon name="lucide:arrow-left" class="size-4" />
          返回卡包列表
        </NuxtLink>
      </header>

      <section v-if="pack" class="pack-detail">
        <div class="pack-header">
          <div>
            <p class="eyebrow">{{ pack.code }}</p>
            <h1>{{ pack.name }}</h1>
            <p class="pack-sub">
              <span class="series-badge">{{ seriesTypeLabel }}</span>
              <span>收录 {{ pack.cardCount }} 张卡牌</span>
            </p>
          </div>
          <span class="pack-count">{{ pack.cardCount }} 张卡牌</span>
        </div>

        <div class="card-list-slot">
          <UIcon name="lucide:layers-3" class="slot-icon" />
          <div>
            <h2>该卡包卡牌列表</h2>
            <p>
              此区域后续展示「{{ pack.name }}」内的全部卡牌。当前数据接入尚未完成。
            </p>
          </div>
        </div>
      </section>

      <section v-else class="empty-state">
        <UIcon name="lucide:database" class="empty-icon" />
        <div>
          <p class="eyebrow">Pack Not Found</p>
          <h1>未找到该卡包</h1>
          <p>无法读取 #{{ slug }} 对应的卡包信息。</p>
        </div>
        <NuxtLink to="/evolve/packs" class="back-link strong">
          返回卡包列表
          <UIcon name="lucide:arrow-right" class="size-4" />
        </NuxtLink>
      </section>
    </section>
  </main>
</template>

<script setup lang="ts">
import { cardCatalog } from '~/composables/cardCatalog';

const route = useRoute();
const slug = computed(() => String(route.params.slug ?? ''));

const pack = computed(() => cardCatalog.evolve.packs.find(set => set.id === slug.value) ?? null);

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

const seriesTypeLabel = computed(() => {
  const code = pack.value?.code ?? '';
  const prefix = Object.keys(groupLabel).find(prefix => code.startsWith(prefix));
  return groupLabel[prefix ?? ''] ?? '其他';
});

useHead({
  title: pack.value ? `${pack.value.name} | Evolve | TCG Cards` : 'Pack Not Found | TCG Cards',
});
</script>

<style scoped>
.pack-page {
  min-height: 100vh;
  padding: 1rem;
  color: #eff6ff;
}

.pack-shell {
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

.pack-detail,
.empty-state {
  border: 1px solid rgb(191 219 254 / 0.14);
  border-radius: 0.5rem;
  background: rgb(14 20 38 / 0.9);
  padding: 1.1rem;
  box-shadow: 0 0.8rem 2rem rgb(0 0 0 / 0.2);
}

.pack-header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.eyebrow {
  color: rgb(147 197 253 / 0.82);
  font-size: 0.72rem;
  font-weight: 850;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.pack-header h1,
.empty-state h1 {
  margin-top: 0.2rem;
  color: #eff6ff;
  font-size: 1.8rem;
  font-weight: 900;
  line-height: 1.12;
}

.pack-count {
  flex-shrink: 0;
  border: 1px solid rgb(96 165 250 / 0.26);
  border-radius: 9999px;
  background: rgb(96 165 250 / 0.08);
  padding: 0.28rem 0.65rem;
  color: #bfdbfe;
  font-size: 0.78rem;
  font-weight: 800;
}

.pack-sub {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  margin-top: 0.45rem;
  color: rgb(239 246 255 / 0.56);
  font-size: 0.85rem;
}

.series-badge {
  border-radius: 0.35rem;
  background: rgb(255 255 255 / 0.08);
  padding: 0.12rem 0.45rem;
  font-size: 0.7rem;
  font-weight: 850;
  letter-spacing: 0.08em;
  color: #93c5fd;
}

.card-list-slot {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 1rem;
  margin-top: 1rem;
  border: 1px dashed rgb(191 219 254 / 0.18);
  border-radius: 0.5rem;
  background: rgb(15 23 42 / 0.38);
  padding: 1rem;
}

.slot-icon {
  width: 2.4rem;
  height: 2.4rem;
  color: #93c5fd;
}

.card-list-slot h2 {
  font-size: 1.05rem;
  font-weight: 850;
}

.card-list-slot p,
.empty-state p {
  max-width: 42rem;
  margin-top: 0.25rem;
  color: rgb(239 246 255 / 0.62);
  line-height: 1.7;
}

.empty-state {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 1rem;
}

.empty-icon {
  width: 2.5rem;
  height: 2.5rem;
  color: #93c5fd;
}

@media (max-width: 52rem) {
  .pack-page {
    padding: 0.65rem;
  }

  .empty-state {
    grid-template-columns: 1fr;
  }
}
</style>
