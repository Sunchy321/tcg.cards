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

          <label class="language-field">
            <span>语言</span>
            <select v-model="language" aria-label="卡牌语言">
              <option
                v-for="option in languageOptions"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
          </label>
        </aside>

        <section class="profile-panel">
          <p class="eyebrow">Card File</p>
          <h1>{{ activeLang.name }}</h1>

          <div class="id-row">
            <span>Passcode</span>
            <strong>{{ card.id }}</strong>
          </div>

          <div class="stat-board">
            <div>
              <span>{{ language === 'zhs' ? '属性' : 'Attribute' }}</span>
              <strong class="attribute-value">
                <img
                  v-if="activeAttributeIcon"
                  :src="activeAttributeIcon"
                  :alt="activeAttribute"
                  class="attribute-icon"
                >
                <span>{{ activeAttributeLabel }}</span>
              </strong>
            </div>
            <div>
              <span>{{ language === 'zhs' ? '种族' : 'Race' }}</span>
              <strong>{{ activeRace }}</strong>
            </div>
            <div>
              <span>{{ language === 'zhs' ? '等级' : 'Level' }}</span>
              <strong>{{ card.level }}</strong>
            </div>
            <div>
              <span>ATK</span>
              <strong>{{ card.attack }}</strong>
            </div>
            <div>
              <span>DEF</span>
              <strong>{{ card.defense }}</strong>
            </div>
            <div>
              <span>{{ language === 'zhs' ? '灵摆刻度' : 'Pendulum Scale' }}</span>
              <strong>{{ card.pendulumScale.left }} / {{ card.pendulumScale.right }}</strong>
            </div>
          </div>

          <div class="tag-row">
            <span
              v-for="tag in activeTags"
              :key="tag"
            >
              {{ tag }}
            </span>
          </div>

          <article>
            <h2>{{ language === 'zhs' ? '灵摆效果' : 'Pendulum Effect' }}</h2>
            <p>{{ activeLang.pendulumEffect }}</p>
          </article>

          <div class="effect-divider" aria-hidden="true" />

          <article>
            <h2>{{ language === 'zhs' ? '怪兽效果' : 'Monster Effect' }}</h2>
            <p>{{ activeLang.monsterEffect }}</p>
          </article>
        </section>

        <aside class="ruling-panel">
          <div class="ruling-head">
            <div>
              <p class="eyebrow">Rulings</p>
              <h2>效果裁定</h2>
            </div>
            <span>YGOCDB</span>
          </div>

          <div class="ruling-empty">
            <UIcon name="lucide:scroll-text" class="ruling-icon" />
            <h3>暂无裁定数据</h3>
            <p>后续接入百鸽裁定后，这里放调整说明、问答和对应日期。</p>
          </div>
        </aside>
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

type LangCode = keyof typeof sampleCard.lang;

const route = useRoute();

const language = ref<LangCode>('zhs');
const languageOptions: Array<{ label: string; value: LangCode }> = [
  { label: '简体中文', value: 'zhs' },
  { label: 'English', value: 'en' },
];

const card = computed(() => route.params.id === String(sampleCard.id) ? sampleCard : null);
const activeLang = computed(() => card.value?.lang[language.value] ?? sampleCard.lang.zhs);
const activeAttribute = computed(() => card.value?.attribute[language.value] ?? '');
const activeAttributeLabel = computed(() =>
  language.value === 'zhs' && activeAttribute.value
    ? `${activeAttribute.value}属性`
    : activeAttribute.value,
);
const activeAttributeIcon = computed(() => {
  const key = card.value?.attribute.en.toLocaleLowerCase();

  return key ? `/yugioh-icons/attribute-${key}-jp.png` : '';
});
const activeRace = computed(() => card.value?.race[language.value] ?? '');
const activeTags = computed(() => card.value?.monsterTypes[language.value] ?? []);

useHead({
  title: computed(() =>
    card.value
      ? `${activeLang.value.name} | TCG Cards`
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
  grid-template-columns: minmax(16rem, 0.72fr) minmax(24rem, 1.28fr) minmax(18rem, 0.88fr);
  gap: 0.75rem;
  align-items: start;
}

.art-panel,
.profile-panel,
.ruling-panel,
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

.language-field {
  display: grid;
  gap: 0.38rem;
  margin-top: 0.75rem;
}

.language-field span {
  color: rgb(253 186 116 / 0.82);
  font-size: 0.76rem;
  font-weight: 850;
}

.language-field select {
  height: 2.35rem;
  min-width: 0;
  border: 1px solid rgb(254 215 170 / 0.16);
  border-radius: 0.45rem;
  background: rgb(15 23 42 / 0.68);
  padding: 0 0.7rem;
  color: #fff7ed;
  font-size: 0.88rem;
  font-weight: 800;
  outline: none;
}

.language-field select:focus {
  border-color: rgb(251 191 36 / 0.72);
  box-shadow: 0 0 0 3px rgb(251 191 36 / 0.12);
}

.profile-panel,
.ruling-panel {
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
  grid-template-columns: repeat(3, minmax(0, 1fr));
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

.stat-board .attribute-value {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.08rem;
  line-height: 1;
}

.attribute-icon {
  width: 1.55rem;
  height: 1.55rem;
  flex-shrink: 0;
  object-fit: contain;
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

article {
  margin-top: 0.85rem;
}

article h2,
.ruling-head h2 {
  color: #fff7ed;
  font-size: 1rem;
  font-weight: 900;
}

article p {
  margin-top: 0.35rem;
  color: rgb(255 247 237 / 0.72);
  font-size: 0.93rem;
  line-height: 1.75;
  white-space: pre-line;
}

.effect-divider {
  height: 1px;
  margin: 1rem 0 0.95rem;
  background:
    linear-gradient(90deg, transparent, rgb(253 186 116 / 0.34), transparent);
  box-shadow: 0 1px 0 rgb(255 255 255 / 0.025);
}

.ruling-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}

.ruling-head h2 {
  margin-top: 0.18rem;
}

.ruling-head span {
  flex-shrink: 0;
  border: 1px solid rgb(251 191 36 / 0.26);
  border-radius: 9999px;
  background: rgb(251 191 36 / 0.08);
  padding: 0.24rem 0.55rem;
  color: #fde68a;
  font-size: 0.72rem;
  font-weight: 850;
}

.ruling-empty {
  margin-top: 0.85rem;
  border: 1px dashed rgb(254 215 170 / 0.18);
  border-radius: 0.45rem;
  background: rgb(15 23 42 / 0.44);
  padding: 0.9rem;
}

.ruling-icon {
  width: 1.8rem;
  height: 1.8rem;
  color: #fdba74;
}

.ruling-empty h3 {
  margin-top: 0.65rem;
  color: #fff7ed;
  font-size: 1rem;
  font-weight: 900;
}

.ruling-empty p {
  margin-top: 0.35rem;
  color: rgb(255 247 237 / 0.62);
  font-size: 0.9rem;
  line-height: 1.65;
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

  .ruling-panel {
    grid-column: 1 / -1;
  }
}

@media (max-width: 52rem) {
  .card-page {
    padding: 0.65rem;
  }

  .detail-layout,
  .not-found,
  .stat-board {
    grid-template-columns: 1fr;
  }

  .art-panel {
    max-width: 24rem;
  }
}
</style>
