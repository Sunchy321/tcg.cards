<template>
  <main class="search-page">
    <section class="search-shell">
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

      <section class="search-panel">
        <div>
          <p class="eyebrow">Card Search</p>
          <h1>游戏王卡牌检索</h1>
          <p class="lead">
            先接入一张本地样例卡，用来验证搜索结果和详情页设计。可以搜索中文名、英文名、编号或效果文本。
          </p>
        </div>

        <form class="search-form" @submit.prevent="submit">
          <UInput
            v-model="input"
            size="xl"
            icon="lucide:search"
            class="search-input"
            placeholder="异色眼灵摆龙 / Odd-Eyes / 16178681"
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
            <h2>{{ heading }}</h2>
          </div>
          <span class="state-pill">{{ stateLabel }}</span>
        </div>

        <NuxtLink
          v-if="result"
          :to="`/cards/${result.id}`"
          class="result-card"
        >
          <img
            :src="result.lang.zhs.image"
            :alt="result.lang.zhs.name"
            class="result-image"
          >

          <div class="result-content">
            <div class="result-title-row">
              <div>
                <h3>{{ result.names.zhs }}</h3>
                <p>{{ result.names.en }}</p>
              </div>
              <span class="card-id">#{{ result.id }}</span>
            </div>

            <div class="meta-grid">
              <span>{{ result.attribute.zhs }} / {{ result.attribute.en }}</span>
              <span>{{ result.race.zhs }} / {{ result.race.en }}</span>
              <span>等级 {{ result.level }}</span>
              <span>ATK {{ result.attack }} / DEF {{ result.defense }}</span>
              <span>灵摆 {{ result.pendulumScale.left }} / {{ result.pendulumScale.right }}</span>
              <span>{{ result.monsterTypes.zhs.join(' · ') }}</span>
            </div>

            <p class="result-desc">
              {{ result.lang.zhs.monsterEffect }}
            </p>
          </div>

          <span class="detail-action">
            查看详情
            <UIcon name="lucide:arrow-right" class="size-4" />
          </span>
        </NuxtLink>

        <div v-else-if="query" class="empty-state">
          <UIcon name="lucide:search-x" class="empty-icon" />
          <div>
            <h2>没有命中本地样例卡</h2>
            <p>当前只导入了「异色眼灵摆龙」。可以试试搜索「Odd-Eyes」或「16178681」。</p>
          </div>
        </div>

        <div v-else class="empty-state">
          <UIcon name="lucide:database-search" class="empty-icon" />
          <div>
            <h2>从关键词开始</h2>
            <p>试试「异色眼灵摆龙」「Odd-Eyes Pendulum Dragon」「16178681」。</p>
          </div>
          <NuxtLink to="/search/advanced" class="advanced-card">
            <UIcon name="lucide:sliders-horizontal" class="size-5" />
            打开高级搜索
          </NuxtLink>
        </div>
      </section>
    </section>
  </main>
</template>

<script setup lang="ts">
import { sampleCard } from '~/data/sample-card';

const route = useRoute();
const router = useRouter();

const query = computed(() => typeof route.query.q === 'string' ? route.query.q : '');
const input = ref(query.value);

const result = computed(() => isSampleMatch(query.value) ? sampleCard : null);
const heading = computed(() => {
  if (result.value) {
    return '找到 1 张卡牌';
  }

  return query.value ? '没有结果' : '等待输入查询';
});
const stateLabel = computed(() => {
  if (result.value) {
    return '本地样例';
  }

  return query.value ? '无结果' : '空状态';
});

watch(query, value => {
  input.value = value;
});

useHead({
  title: 'Yu-Gi-Oh! Search | TCG Cards',
});

const submit = async () => {
  const q = input.value.trim();

  await router.replace({
    path: '/search',
    query: q ? { q } : {},
  });
};

function isSampleMatch(value: string) {
  const raw = value.trim().toLocaleLowerCase();

  if (raw === '') {
    return false;
  }

  const compact = compactText(raw);
  const fields = [
    String(sampleCard.id),
    String(sampleCard.cid),
    sampleCard.names.zhs,
    sampleCard.names.en,
    sampleCard.names.ja,
    sampleCard.lang.zhs.typeLine,
    sampleCard.lang.zhs.pendulumEffect,
    sampleCard.lang.zhs.monsterEffect,
    sampleCard.lang.en.typeLine,
    sampleCard.lang.en.pendulumEffect,
    sampleCard.lang.en.monsterEffect,
    sampleCard.attribute.zhs,
    sampleCard.attribute.en,
    sampleCard.race.zhs,
    sampleCard.race.en,
    ...sampleCard.monsterTypes.zhs,
    ...sampleCard.monsterTypes.en,
  ].map(item => item.toLocaleLowerCase());

  return fields.some(item =>
    item.includes(raw) || compactText(item).includes(compact),
  );
}

function compactText(value: string) {
  return value.replace(/[\s\-_/:'"!.，。；：、（）()]+/g, '');
}
</script>

<style scoped>
.search-page {
  min-height: 100vh;
  padding: 1rem;
  color: #fff7ed;
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
  color: rgb(255 247 237 / 0.74);
  font-size: 0.9rem;
  font-weight: 700;
}

.back-link:hover,
.advanced-link:hover {
  color: #fff7ed;
}

.advanced-link,
.advanced-card {
  border: 1px solid rgb(254 215 170 / 0.16);
  border-radius: 0.5rem;
  background: rgb(255 255 255 / 0.07);
  padding: 0.55rem 0.75rem;
}

.search-panel,
.result-panel {
  border: 1px solid rgb(254 215 170 / 0.14);
  border-radius: 0.5rem;
  background: rgb(18 16 14 / 0.9);
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
  color: rgb(253 186 116 / 0.82);
  font-size: 0.72rem;
  font-weight: 850;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

h1 {
  margin-top: 0.22rem;
  color: #fff7ed;
  font-size: 2rem;
  font-weight: 900;
  line-height: 1.08;
}

.lead {
  max-width: 34rem;
  margin-top: 0.5rem;
  color: rgb(255 247 237 / 0.66);
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

.result-card {
  display: grid;
  grid-template-columns: 7.25rem minmax(0, 1fr) auto;
  gap: 1rem;
  align-items: center;
  margin-top: 0.9rem;
  border: 1px solid rgb(254 215 170 / 0.16);
  border-radius: 0.5rem;
  background:
    linear-gradient(90deg, rgb(251 191 36 / 0.12), transparent 18rem),
    rgb(15 23 42 / 0.48);
  padding: 0.75rem;
  color: #fff7ed;
  transition: border-color 0.14s ease, background 0.14s ease, transform 0.14s ease;
}

.result-card:hover {
  transform: translateY(-1px);
  border-color: rgb(251 191 36 / 0.48);
  background:
    linear-gradient(90deg, rgb(251 191 36 / 0.16), transparent 18rem),
    rgb(15 23 42 / 0.66);
}

.result-image {
  width: 7.25rem;
  aspect-ratio: 421 / 614;
  border-radius: 0.35rem;
  object-fit: cover;
  box-shadow: 0 0.65rem 1.4rem rgb(0 0 0 / 0.38);
}

.result-content {
  min-width: 0;
}

.result-title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}

.result-title-row h3 {
  font-size: 1.35rem;
  font-weight: 900;
  line-height: 1.15;
}

.result-title-row p {
  margin-top: 0.2rem;
  color: rgb(255 247 237 / 0.62);
  font-size: 0.9rem;
  font-weight: 700;
}

.card-id {
  flex-shrink: 0;
  color: rgb(253 186 116 / 0.78);
  font-size: 0.78rem;
  font-weight: 850;
}

.meta-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 0.75rem;
}

.meta-grid span {
  border: 1px solid rgb(254 215 170 / 0.13);
  border-radius: 9999px;
  background: rgb(0 0 0 / 0.18);
  padding: 0.3rem 0.55rem;
  color: rgb(255 247 237 / 0.78);
  font-size: 0.78rem;
  font-weight: 800;
}

.result-desc {
  margin-top: 0.75rem;
  color: rgb(255 247 237 / 0.68);
  font-size: 0.9rem;
  line-height: 1.65;
}

.detail-action {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  align-self: end;
  border: 1px solid rgb(251 191 36 / 0.36);
  border-radius: 0.45rem;
  background: rgb(251 191 36 / 0.12);
  padding: 0.52rem 0.7rem;
  color: #fde68a;
  font-size: 0.84rem;
  font-weight: 850;
  white-space: nowrap;
}

.empty-state {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 1rem;
  margin-top: 0.9rem;
  border: 1px dashed rgb(254 215 170 / 0.18);
  border-radius: 0.5rem;
  background: rgb(15 23 42 / 0.38);
  padding: 1rem;
}

.empty-icon {
  width: 2.4rem;
  height: 2.4rem;
  color: #fdba74;
}

.empty-state p {
  max-width: 42rem;
  color: rgb(255 247 237 / 0.62);
  line-height: 1.7;
}

@media (max-width: 52rem) {
  .search-panel,
  .search-form,
  .empty-state,
  .result-card {
    grid-template-columns: 1fr;
  }

  .result-image {
    width: min(12rem, 100%);
  }

  .detail-action {
    justify-content: center;
  }
}
</style>
