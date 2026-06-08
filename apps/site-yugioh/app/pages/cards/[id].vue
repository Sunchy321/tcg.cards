<template>
  <main class="card-page">
    <section class="card-shell">
      <header class="topbar">
        <NuxtLink to="/search" class="back-link">
          <UIcon name="lucide:arrow-left" class="size-4" />
          返回搜索
        </NuxtLink>

        <span class="source-pill">Local Sample</span>
      </header>

      <section v-if="card" class="detail-layout">
        <aside class="art-panel">
          <div class="art-frame">
            <img
              :src="activeLang.image"
              :alt="activeLang.name"
              class="card-art"
            >
          </div>

          <div class="lang-switch" aria-label="卡图语言">
            <button
              type="button"
              :class="{ active: imageLang === 'zhs' }"
              @click="imageLang = 'zhs'"
            >
              中文
            </button>
            <button
              type="button"
              :class="{ active: imageLang === 'en' }"
              @click="imageLang = 'en'"
            >
              English
            </button>
          </div>
        </aside>

        <section class="profile-panel">
          <p class="eyebrow">Card File</p>
          <h1>{{ card.names.zhs }}</h1>
          <p class="en-name">{{ card.names.en }}</p>
          <p class="ja-name">{{ card.names.ja }}</p>

          <div class="id-row">
            <span>Passcode</span>
            <strong>{{ card.id }}</strong>
          </div>

          <div class="stat-board">
            <div>
              <span>属性</span>
              <strong>{{ card.attribute.zhs }} / {{ card.attribute.en }}</strong>
            </div>
            <div>
              <span>种族</span>
              <strong>{{ card.race.zhs }} / {{ card.race.en }}</strong>
            </div>
            <div>
              <span>等级</span>
              <strong>{{ card.level }}</strong>
            </div>
            <div>
              <span>攻击力</span>
              <strong>{{ card.attack }}</strong>
            </div>
            <div>
              <span>守备力</span>
              <strong>{{ card.defense }}</strong>
            </div>
            <div>
              <span>灵摆刻度</span>
              <strong>{{ card.pendulumScale.left }} / {{ card.pendulumScale.right }}</strong>
            </div>
          </div>

          <div class="tag-row">
            <span
              v-for="tag in card.monsterTypes.zhs"
              :key="tag"
            >
              {{ tag }}
            </span>
          </div>
        </section>

        <section class="text-panel">
          <div class="text-column">
            <div class="text-head">
              <p class="eyebrow">简体中文</p>
              <h2>{{ card.lang.zhs.name }}</h2>
            </div>
            <pre>{{ card.lang.zhs.typeLine }}</pre>
            <article>
              <h3>灵摆效果</h3>
              <p>{{ card.lang.zhs.pendulumEffect }}</p>
            </article>
            <article>
              <h3>怪兽效果</h3>
              <p>{{ card.lang.zhs.monsterEffect }}</p>
            </article>
          </div>

          <div class="text-column">
            <div class="text-head">
              <p class="eyebrow">English</p>
              <h2>{{ card.lang.en.name }}</h2>
            </div>
            <pre>{{ card.lang.en.typeLine }}</pre>
            <article>
              <h3>Pendulum Effect</h3>
              <p>{{ card.lang.en.pendulumEffect }}</p>
            </article>
            <article>
              <h3>Monster Effect</h3>
              <p>{{ card.lang.en.monsterEffect }}</p>
            </article>
          </div>
        </section>
      </section>

      <section v-else class="not-found">
        <UIcon name="lucide:file-question" class="empty-icon" />
        <div>
          <p class="eyebrow">Card Not Found</p>
          <h1>没有这张本地样例卡</h1>
          <p>当前只导入了 #{{ sampleCard.id }}。请从搜索页进入样例详情。</p>
        </div>
        <NuxtLink to="/search?q=异色眼灵摆龙" class="back-link strong">
          搜索样例卡
          <UIcon name="lucide:arrow-right" class="size-4" />
        </NuxtLink>
      </section>
    </section>
  </main>
</template>

<script setup lang="ts">
import { sampleCard } from '~/data/sample-card';

const route = useRoute();

const imageLang = ref<'zhs' | 'en'>('zhs');
const card = computed(() => route.params.id === String(sampleCard.id) ? sampleCard : null);
const activeLang = computed(() => card.value?.lang[imageLang.value] ?? sampleCard.lang.zhs);

useHead({
  title: computed(() =>
    card.value
      ? `${card.value.names.en} | TCG Cards`
      : 'Card Not Found | TCG Cards',
  ),
});
</script>

<style scoped>
.card-page {
  min-height: 100vh;
  padding: 1rem;
  color: #fff7ed;
}

.card-shell {
  width: min(92rem, 100%);
  margin: 0 auto;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 1rem 0;
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  color: rgb(255 247 237 / 0.74);
  font-size: 0.9rem;
  font-weight: 750;
}

.back-link:hover {
  color: #fff7ed;
}

.back-link.strong,
.source-pill {
  border: 1px solid rgb(254 215 170 / 0.16);
  border-radius: 0.5rem;
  background: rgb(255 255 255 / 0.07);
  padding: 0.55rem 0.75rem;
}

.source-pill {
  color: #fde68a;
  font-size: 0.78rem;
  font-weight: 850;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.detail-layout {
  display: grid;
  grid-template-columns: minmax(16rem, 0.74fr) minmax(18rem, 0.9fr) minmax(26rem, 1.55fr);
  gap: 0.75rem;
  align-items: start;
}

.art-panel,
.profile-panel,
.text-panel,
.not-found {
  border: 1px solid rgb(254 215 170 / 0.14);
  border-radius: 0.5rem;
  background: rgb(18 16 14 / 0.9);
  box-shadow: 0 0.8rem 2rem rgb(0 0 0 / 0.2);
}

.art-panel {
  padding: 0.85rem;
}

.art-frame {
  border-radius: 0.45rem;
  background:
    linear-gradient(180deg, rgb(251 191 36 / 0.16), transparent 42%),
    rgb(0 0 0 / 0.26);
  padding: 0.7rem;
}

.card-art {
  width: 100%;
  aspect-ratio: 421 / 614;
  border-radius: 0.38rem;
  object-fit: cover;
  box-shadow: 0 1rem 2.2rem rgb(0 0 0 / 0.42);
}

.lang-switch {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.25rem;
  margin-top: 0.75rem;
  border: 1px solid rgb(254 215 170 / 0.14);
  border-radius: 0.45rem;
  background: rgb(15 23 42 / 0.58);
  padding: 0.25rem;
}

.lang-switch button {
  min-height: 2.1rem;
  border-radius: 0.35rem;
  color: rgb(255 247 237 / 0.62);
  font-size: 0.84rem;
  font-weight: 850;
}

.lang-switch button.active {
  background: #facc15;
  color: #1c1009;
}

.profile-panel {
  padding: 1rem;
}

.eyebrow {
  color: rgb(253 186 116 / 0.82);
  font-size: 0.72rem;
  font-weight: 850;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

h1 {
  margin-top: 0.2rem;
  color: #fff7ed;
  font-size: 2rem;
  font-weight: 950;
  line-height: 1.08;
}

.en-name {
  margin-top: 0.35rem;
  color: rgb(255 247 237 / 0.7);
  font-size: 1.05rem;
  font-weight: 800;
}

.ja-name {
  margin-top: 0.2rem;
  color: rgb(255 247 237 / 0.48);
  font-size: 0.9rem;
  font-weight: 700;
}

.id-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-top: 1rem;
  border-top: 1px solid rgb(254 215 170 / 0.12);
  border-bottom: 1px solid rgb(254 215 170 / 0.12);
  padding: 0.7rem 0;
}

.id-row span,
.stat-board span {
  color: rgb(255 247 237 / 0.52);
  font-size: 0.78rem;
  font-weight: 800;
}

.id-row strong {
  color: #fde68a;
  font-size: 1rem;
  font-weight: 900;
}

.stat-board {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.45rem;
  margin-top: 0.8rem;
}

.stat-board div {
  min-height: 4.1rem;
  border: 1px solid rgb(254 215 170 / 0.12);
  border-radius: 0.45rem;
  background: rgb(15 23 42 / 0.44);
  padding: 0.65rem;
}

.stat-board strong {
  display: block;
  margin-top: 0.28rem;
  color: #fff7ed;
  font-size: 1rem;
  font-weight: 900;
  line-height: 1.25;
}

.tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 0.85rem;
}

.tag-row span {
  border: 1px solid rgb(251 191 36 / 0.34);
  border-radius: 9999px;
  background: rgb(251 191 36 / 0.11);
  padding: 0.32rem 0.6rem;
  color: #fde68a;
  font-size: 0.8rem;
  font-weight: 850;
}

.text-panel {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.65rem;
  padding: 0.75rem;
}

.text-column {
  border: 1px solid rgb(254 215 170 / 0.11);
  border-radius: 0.45rem;
  background: rgb(15 23 42 / 0.5);
  padding: 0.8rem;
}

.text-head h2 {
  margin-top: 0.18rem;
  color: #fff7ed;
  font-size: 1.25rem;
  font-weight: 900;
  line-height: 1.18;
}

pre {
  margin-top: 0.65rem;
  border: 1px solid rgb(254 215 170 / 0.12);
  border-radius: 0.4rem;
  background: rgb(0 0 0 / 0.2);
  padding: 0.6rem;
  color: rgb(255 247 237 / 0.72);
  font-family: inherit;
  font-size: 0.86rem;
  font-weight: 800;
  line-height: 1.55;
  white-space: pre-wrap;
}

article {
  margin-top: 0.75rem;
}

article h3 {
  color: rgb(253 186 116 / 0.82);
  font-size: 0.82rem;
  font-weight: 900;
}

article p {
  margin-top: 0.35rem;
  color: rgb(255 247 237 / 0.72);
  font-size: 0.93rem;
  line-height: 1.75;
  white-space: pre-line;
}

.not-found {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
}

.empty-icon {
  width: 2.5rem;
  height: 2.5rem;
  color: #fdba74;
}

.not-found p:last-child {
  margin-top: 0.35rem;
  color: rgb(255 247 237 / 0.62);
}

@media (max-width: 78rem) {
  .detail-layout {
    grid-template-columns: minmax(15rem, 0.72fr) minmax(0, 1fr);
  }

  .text-panel {
    grid-column: 1 / -1;
  }
}

@media (max-width: 52rem) {
  .card-page {
    padding: 0.65rem;
  }

  .detail-layout,
  .text-panel,
  .not-found {
    grid-template-columns: 1fr;
  }

  .art-panel {
    max-width: 24rem;
  }
}
</style>
