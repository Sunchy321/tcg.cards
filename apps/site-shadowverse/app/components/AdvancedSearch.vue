<template>
  <div class="advanced-root" :class="catalog.id">
    <!-- ===== Beyond：夜空星域控制台 ===== -->
    <div v-if="isBeyond" class="beyond-shell">
      <section class="beyond-hero">
        <div class="hero-glow" aria-hidden="true" />
        <div class="hero-copy">
          <p class="eyebrow">Advanced Search</p>
          <h1>{{ catalog.title }}高级搜索</h1>
          <p class="hero-note">在星域中选择条件，精确定位你想要的卡牌。</p>
        </div>
        <form class="search-form" @submit.prevent="submit">
          <input
            v-model="keyword"
            class="keyword-input"
            placeholder="输入关键词"
          >
          <select v-model="language" class="select-input" aria-label="搜索语言">
            <option value="zhs">简体中文</option>
            <option value="ja">日本語</option>
            <option value="en">English</option>
          </select>
          <select v-model="field" class="select-input" aria-label="搜索范围">
            <option value="name">搜索卡名</option>
            <option value="text">检索效果文本</option>
            <option value="card_no">检索卡牌编号</option>
          </select>
          <button type="submit" class="search-button">
            <UIcon name="lucide:search" class="size-4" />
            搜索
          </button>
        </form>
      </section>

      <div class="query-strip">
        <span class="strip-dot" aria-hidden="true" />
        <code>{{ queryText === '' ? '尚未选择筛选条件' : queryText }}</code>
        <button type="button" class="strip-button" @click="resetAll">
          <UIcon name="lucide:rotate-ccw" class="size-4" />
          重置
        </button>
      </div>

      <div class="beyond-workspace">
        <aside class="kind-column">
          <section class="kind-panel">
            <div class="panel-head">
              <h2>筛选入口</h2>
              <p class="panel-caption">Kind</p>
            </div>
            <div class="kind-list">
              <button
                v-for="kind in catalog.cardKinds"
                :key="kind.value"
                type="button"
                class="kind-button"
                :class="{ active: cardKind === kind.value }"
                @click="setKind(kind.value)"
              >
                <UIcon :name="kind.icon" class="kind-icon" />
                <span>{{ kind.label }}</span>
              </button>
            </div>
          </section>

          <section class="selected-panel">
            <div class="panel-head">
              <h2>已选条件</h2>
              <span class="selected-count">{{ selectedCount }}</span>
            </div>

            <div v-if="selectedCount > 0" class="selected-groups">
              <div
                v-for="group in selectedGroups"
                :key="group.id"
                class="selected-group"
              >
                <h3>{{ group.label }}</h3>
                <div class="selected-list">
                  <button
                    v-for="chip in group.chips"
                    :key="chip.value"
                    type="button"
                    class="selected-chip"
                    @click="toggle(group.id, chip.value)"
                  >
                    {{ chip.label }}
                    <UIcon name="lucide:x" class="size-3" />
                  </button>
                </div>
              </div>

              <div v-if="catalog.showStats && statChips.length > 0" class="selected-group">
                <h3>数值</h3>
                <div class="selected-list">
                  <button
                    v-for="chip in statChips"
                    :key="chip.key"
                    type="button"
                    class="selected-chip"
                    @click="clearStat(chip.key)"
                  >
                    {{ chip.label }}
                    <UIcon name="lucide:x" class="size-3" />
                  </button>
                </div>
              </div>
            </div>

            <p v-else class="empty-selected">还没有选择条件。</p>
          </section>
        </aside>

        <section class="stage">
          <div class="stage-heading">
            <div>
              <p>Filter Constellation</p>
              <h2>筛选条件</h2>
            </div>
            <span>{{ visibleSectionCount }} 组条件</span>
          </div>

          <div class="section-grid">
            <section
              v-for="section in visibleSections"
              :key="section.id"
              class="filter-card"
              :class="{ wide: section.wide }"
            >
              <div class="filter-card-head">
                <div>
                  <p>{{ section.caption }}</p>
                  <h3>{{ section.label }}</h3>
                </div>
                <button
                  type="button"
                  class="mini-reset"
                  :aria-label="`清除${section.label}`"
                  @click="clearSection(section.id)"
                >
                  <UIcon name="lucide:rotate-ccw" class="size-3.5" />
                </button>
              </div>

              <div
                class="option-cloud"
                :class="{ dense: section.dense, numeric: section.numeric, 'single-line': section.singleLine }"
              >
                <button
                  v-for="option in section.options"
                  :key="option.value"
                  type="button"
                  class="option-pill"
                  :class="{ active: isSelected(section.id, option.value), 'number-pill': section.numeric }"
                  @click="toggle(section.id, option.value)"
                >
                  {{ option.label }}
                </button>
              </div>
            </section>

            <section v-if="catalog.showStats" class="filter-card wide">
              <div class="filter-card-head">
                <div>
                  <p>Follower Stats</p>
                  <h3>攻击力 / 生命值</h3>
                </div>
                <button type="button" class="mini-reset" aria-label="清除数值条件" @click="clearStats">
                  <UIcon name="lucide:rotate-ccw" class="size-3.5" />
                </button>
              </div>

              <div class="stat-grid">
                <label>
                  <span>攻击下限</span>
                  <input v-model="attackMin" inputmode="numeric" placeholder="1">
                </label>
                <label>
                  <span>攻击上限</span>
                  <input v-model="attackMax" inputmode="numeric" placeholder="7">
                </label>
                <label>
                  <span>生命下限</span>
                  <input v-model="lifeMin" inputmode="numeric" placeholder="1">
                </label>
                <label>
                  <span>生命上限</span>
                  <input v-model="lifeMax" inputmode="numeric" placeholder="7">
                </label>
              </div>
            </section>
          </div>
        </section>
      </div>
    </div>

    <!-- ===== Evolve：卡牌档案目录 ===== -->
    <div v-else class="evolve-shell">
      <section class="evolve-hero">
        <div class="hero-copy">
          <p class="eyebrow">
            <span class="eyebrow-index">01</span>
            Advanced Search
          </p>
          <h1>{{ catalog.title }}高级搜索</h1>
          <p class="hero-note">按职业、稀有度与费用索引卡牌，构建检索档案。</p>
        </div>
        <form class="search-form" @submit.prevent="submit">
          <input
            v-model="keyword"
            class="keyword-input"
            placeholder="输入关键词"
          >
          <select v-model="language" class="select-input" aria-label="搜索语言">
            <option value="zhs">简体中文</option>
            <option value="ja">日本語</option>
            <option value="en">English</option>
          </select>
          <select v-model="field" class="select-input" aria-label="搜索范围">
            <option value="name">搜索卡名</option>
            <option value="text">检索效果文本</option>
            <option value="card_no">检索卡牌编号</option>
          </select>
          <button type="submit" class="search-button">
            搜索
            <UIcon name="lucide:arrow-right" class="size-4" />
          </button>
        </form>
      </section>

      <div class="query-strip">
        <code><span class="strip-caret">&gt;</span>{{ queryText === '' ? '尚未选择筛选条件' : queryText }}</code>
        <button type="button" class="strip-button" @click="resetAll">
          <UIcon name="lucide:rotate-ccw" class="size-4" />
          重置
        </button>
      </div>

      <div class="evolve-workspace">
        <aside class="index-column">
          <section class="kind-panel">
            <div class="panel-head">
              <p class="panel-caption">Index · 种类</p>
            </div>
            <div class="kind-list">
              <button
                v-for="(kind, index) in catalog.cardKinds"
                :key="kind.value"
                type="button"
                class="kind-button"
                :class="{ active: cardKind === kind.value }"
                @click="setKind(kind.value)"
              >
                <span class="kind-no">0{{ index + 1 }}</span>
                <UIcon :name="kind.icon" class="kind-icon" />
                <span class="kind-label">{{ kind.label }}</span>
              </button>
            </div>
          </section>

          <section class="selected-panel">
            <div class="panel-head">
              <p class="panel-caption">Selected · {{ selectedCount }}</p>
            </div>

            <div v-if="selectedCount > 0" class="selected-groups">
              <div
                v-for="group in selectedGroups"
                :key="group.id"
                class="selected-group"
              >
                <h3>{{ group.label }}</h3>
                <div class="selected-list">
                  <button
                    v-for="chip in group.chips"
                    :key="chip.value"
                    type="button"
                    class="selected-chip"
                    @click="toggle(group.id, chip.value)"
                  >
                    {{ chip.label }}
                    <UIcon name="lucide:x" class="size-3" />
                  </button>
                </div>
              </div>

              <div v-if="catalog.showStats && statChips.length > 0" class="selected-group">
                <h3>数值</h3>
                <div class="selected-list">
                  <button
                    v-for="chip in statChips"
                    :key="chip.key"
                    type="button"
                    class="selected-chip"
                    @click="clearStat(chip.key)"
                  >
                    {{ chip.label }}
                    <UIcon name="lucide:x" class="size-3" />
                  </button>
                </div>
              </div>
            </div>

            <p v-else class="empty-selected">还没有选择条件。</p>
          </section>
        </aside>

        <section class="stage">
          <div class="stage-heading">
            <div>
              <p>Filter Archive</p>
              <h2>筛选条件</h2>
            </div>
            <span>{{ visibleSectionCount }} 组条件</span>
          </div>

          <div class="section-grid">
            <section
              v-for="section in visibleSections"
              :key="section.id"
              class="filter-card"
              :class="{ wide: section.wide }"
            >
              <div class="filter-card-head">
                <div>
                  <p>{{ section.caption }}</p>
                  <h3>{{ section.label }}</h3>
                </div>
                <button
                  type="button"
                  class="mini-reset"
                  :aria-label="`清除${section.label}`"
                  @click="clearSection(section.id)"
                >
                  <UIcon name="lucide:rotate-ccw" class="size-3.5" />
                </button>
              </div>

              <div
                class="option-cloud"
                :class="{ dense: section.dense, numeric: section.numeric, 'single-line': section.singleLine }"
              >
                <button
                  v-for="option in section.options"
                  :key="option.value"
                  type="button"
                  class="option-pill"
                  :class="{ active: isSelected(section.id, option.value), 'number-pill': section.numeric }"
                  @click="toggle(section.id, option.value)"
                >
                  {{ option.label }}
                </button>
              </div>
            </section>

            <section v-if="catalog.showStats" class="filter-card wide">
              <div class="filter-card-head">
                <div>
                  <p>Follower Stats</p>
                  <h3>攻击力 / 生命值</h3>
                </div>
                <button type="button" class="mini-reset" aria-label="清除数值条件" @click="clearStats">
                  <UIcon name="lucide:rotate-ccw" class="size-3.5" />
                </button>
              </div>

              <div class="stat-grid">
                <label>
                  <span>攻击下限</span>
                  <input v-model="attackMin" inputmode="numeric" placeholder="1">
                </label>
                <label>
                  <span>攻击上限</span>
                  <input v-model="attackMax" inputmode="numeric" placeholder="7">
                </label>
                <label>
                  <span>生命下限</span>
                  <input v-model="lifeMin" inputmode="numeric" placeholder="1">
                </label>
                <label>
                  <span>生命上限</span>
                  <input v-model="lifeMax" inputmode="numeric" placeholder="7">
                </label>
              </div>
            </section>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CardCatalog, FilterSection } from '~/composables/cardCatalog';

const props = defineProps<{
  catalog: CardCatalog;
}>();

type CardKind = string;

const router = useRouter();

const isBeyond = computed(() => props.catalog.id === 'beyond');

const keyword = ref('');
const language = ref('zhs');
const field = ref('name');
const cardKind = ref<CardKind>('all');
const attackMin = ref('');
const attackMax = ref('');
const lifeMin = ref('');
const lifeMax = ref('');
const selected = reactive<Record<string, string[]>>({});

const sections: FilterSection[] = props.catalog.sections;

const currentKindLabel = computed(() =>
  props.catalog.cardKinds.find(kind => kind.value === cardKind.value)?.label ?? '全部卡',
);

const visibleSections = computed(() =>
  sections.filter(section => section.kinds.includes(cardKind.value)),
);

const showStats = computed(() =>
  props.catalog.showStats && (cardKind.value === 'all' || cardKind.value === 'follower'),
);

const visibleSectionCount = computed(() =>
  visibleSections.value.length + (showStats.value ? 1 : 0),
);

const selectedGroups = computed(() =>
  sections
    .map(section => ({
      id: section.id,
      label: section.label,
      chips: (selected[section.id] ?? []).map(value => ({
        value,
        label: section.options.find(option => option.value === value)?.label ?? value,
      })),
    }))
    .filter(group => group.chips.length > 0),
);

const statChips = computed(() => {
  const stats = [
    { key: 'attackMin', label: '攻击下限', value: attackMin.value.trim() },
    { key: 'attackMax', label: '攻击上限', value: attackMax.value.trim() },
    { key: 'lifeMin', label: '生命下限', value: lifeMin.value.trim() },
    { key: 'lifeMax', label: '生命上限', value: lifeMax.value.trim() },
  ];

  return stats
    .filter(stat => stat.value !== '')
    .map(stat => ({
      key: stat.key,
      label: `${stat.label}: ${stat.value}`,
    }));
});

const selectedCount = computed(() =>
  selectedGroups.value.reduce((sum, group) => sum + group.chips.length, 0)
  + statChips.value.length,
);

function setKind(value: CardKind) {
  cardKind.value = value;
}

function isSelected(section: string, value: string) {
  return selected[section]?.includes(value) ?? false;
}

function toggle(section: string, value: string) {
  const values = selected[section] ?? [];
  const index = values.indexOf(value);

  selected[section] = index >= 0
    ? values.filter(item => item !== value)
    : [...values, value];
}

function clearSection(section: string) {
  selected[section] = [];
}

function clearStats() {
  attackMin.value = '';
  attackMax.value = '';
  lifeMin.value = '';
  lifeMax.value = '';
}

function clearStat(key: string) {
  if (key === 'attackMin') {
    attackMin.value = '';
  }

  if (key === 'attackMax') {
    attackMax.value = '';
  }

  if (key === 'lifeMin') {
    lifeMin.value = '';
  }

  if (key === 'lifeMax') {
    lifeMax.value = '';
  }
}

function resetAll() {
  for (const section of Object.keys(selected)) {
    selected[section] = [];
  }

  clearStats();
  cardKind.value = 'all';
}

const queryText = computed(() => {
  const parts = [
    keyword.value.trim(),
    cardKind.value !== 'all' ? `kind:${cardKind.value}` : '',
    `lang:${language.value}`,
    `field:${field.value}`,
    ...Object.entries(selected).flatMap(([section, values]) =>
      values.map(value => `${section}:${value}`),
    ),
    ...(props.catalog.showStats ? [
      attackMin.value.trim() ? `attack>=${attackMin.value.trim()}` : '',
      attackMax.value.trim() ? `attack<=${attackMax.value.trim()}` : '',
      lifeMin.value.trim() ? `life>=${lifeMin.value.trim()}` : '',
      lifeMax.value.trim() ? `life<=${lifeMax.value.trim()}` : '',
    ] : []),
  ];

  return parts.filter(Boolean).join(' ');
});

async function submit() {
  await router.push({
    path: `/${props.catalog.id}/search`,
    query: queryText.value ? { q: queryText.value } : {},
  });
}
</script>

<style scoped>
/* ============================================================
   Beyond：夜空中的星域控制台（辉光玻璃、柔和圆角、星座点缀）
   ============================================================ */

.advanced-root.beyond {
  color: #edf6ff;
}

.beyond-shell {
  display: grid;
  gap: 0.8rem;
}

.beyond-hero {
  position: relative;
  overflow: hidden;
  display: grid;
  grid-template-columns: minmax(16rem, 0.62fr) minmax(26rem, 1.38fr);
  gap: 2.2rem;
  align-items: center;
  border: 1px solid rgb(88 216 244 / 0.2);
  border-radius: 0.95rem;
  background:
    radial-gradient(circle at 9% 12%, rgb(88 216 244 / 0.16) 0 1px, transparent 1.6px),
    radial-gradient(circle at 92% 88%, rgb(157 139 255 / 0.2) 0 1px, transparent 1.6px),
    radial-gradient(26rem 12rem at 82% 0%, rgb(79 141 247 / 0.26), transparent 66%),
    radial-gradient(18rem 10rem at 6% 100%, rgb(88 216 244 / 0.16), transparent 62%),
    rgb(10 19 45 / 0.82);
  padding: 1.5rem 1.6rem;
  box-shadow: 0 0.9rem 2.4rem rgb(0 0 0 / 0.34);
}

.beyond-hero::before {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(90deg, rgb(255 255 255 / 0.045) 1px, transparent 1px),
    linear-gradient(rgb(255 255 255 / 0.045) 1px, transparent 1px);
  background-size: 2.4rem 2.4rem;
  content: '';
  pointer-events: none;
}

.hero-glow {
  position: absolute;
  top: -4.5rem;
  right: -4.5rem;
  width: 13rem;
  height: 13rem;
  border: 1px solid rgb(157 139 255 / 0.26);
  border-radius: 50%;
  box-shadow: 0 0 3.4rem rgb(88 216 244 / 0.3);
  pointer-events: none;
}

.hero-copy {
  position: relative;
  z-index: 1;
}

.beyond-hero .eyebrow {
  color: #58d8f4;
  font-size: 0.68rem;
  font-weight: 850;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.eyebrow-index {
  color: #9d8bff;
}

.beyond-hero h1 {
  margin-top: 0.3rem;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: clamp(1.9rem, 3.2vw, 2.8rem);
  font-weight: 500;
  letter-spacing: 0.07em;
  line-height: 1.08;
  color: #f0f8ff;
  text-shadow: 0 0 1.6rem rgb(88 216 244 / 0.38);
}

.beyond-hero .hero-note {
  margin-top: 0.55rem;
  color: rgb(214 236 255 / 0.62);
  font-size: 0.92rem;
  line-height: 1.6;
}

.beyond-hero .search-form {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: minmax(13rem, 1fr) 7.5rem 8.2rem 6.2rem;
  gap: 0.55rem;
}

.beyond-hero .keyword-input,
.beyond-hero .select-input,
.beyond-hero .stat-grid input {
  min-width: 0;
  height: 2.7rem;
  border: 1px solid rgb(88 216 244 / 0.26);
  border-radius: 0.55rem;
  background: rgb(5 14 38 / 0.72);
  padding: 0 0.75rem;
  color: #eaf6ff;
  font-size: 0.86rem;
  font-weight: 700;
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.beyond-hero .keyword-input::placeholder,
.beyond-hero .stat-grid input::placeholder {
  color: rgb(148 197 235 / 0.48);
}

.beyond-hero .keyword-input:focus,
.beyond-hero .select-input:focus,
.beyond-hero .stat-grid input:focus {
  border-color: #58d8f4;
  box-shadow: 0 0 0 3px rgb(88 216 244 / 0.16), 0 0 1.2rem rgb(88 216 244 / 0.22);
}

.beyond-hero .search-button,
.beyond-hero .strip-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  border-radius: 0.55rem;
  font-weight: 850;
}

.beyond-hero .search-button {
  height: 2.7rem;
  border: 1px solid #58d8f4;
  background: linear-gradient(135deg, #4f8df7, #6ddaf3);
  color: #06142c;
  font-size: 0.86rem;
  box-shadow: 0 0 1.2rem rgb(88 216 244 / 0.32);
}

.beyond-shell .query-strip {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  padding: 0.15rem 0.1rem 0.5rem;
}

.beyond-shell .strip-dot {
  flex-shrink: 0;
  width: 0.4rem;
  height: 0.4rem;
  border-radius: 50%;
  background: #58d8f4;
  box-shadow: 0 0 0.7rem rgb(88 216 244 / 85%);
}

.beyond-shell .query-strip code {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  color: #9fd8f5;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.78rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.beyond-shell .strip-button {
  flex-shrink: 0;
  height: 2.1rem;
  border: 1px solid rgb(88 216 244 / 0.28);
  background: rgb(88 216 244 / 0.08);
  padding: 0 0.75rem;
  color: #58d8f4;
  font-size: 0.82rem;
}

.beyond-workspace {
  display: grid;
  grid-template-columns: 17rem minmax(0, 1fr);
  gap: 0.9rem;
  align-items: start;
}

.beyond-workspace .kind-column {
  display: grid;
  gap: 0.8rem;
}

.beyond-workspace .kind-panel,
.beyond-workspace .selected-panel,
.beyond-workspace .filter-card,
.beyond-workspace .stage {
  border: 1px solid rgb(88 216 244 / 0.16);
  border-radius: 0.85rem;
  background: rgb(9 18 44 / 0.78);
  box-shadow: 0 0.5rem 1.4rem rgb(0 0 0 / 0.2);
}

.beyond-workspace .kind-panel,
.beyond-workspace .selected-panel {
  padding: 0.85rem;
}

.beyond-workspace .panel-head,
.beyond-workspace .filter-card-head,
.beyond-workspace .stage-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.8rem;
}

.beyond-workspace .panel-head h2 {
  font-size: 1rem;
  font-weight: 850;
  color: #dcedff;
}

.beyond-workspace .panel-caption {
  color: #58d8f4;
  font-size: 0.66rem;
  font-weight: 850;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.beyond-workspace .kind-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.45rem;
  margin-top: 0.7rem;
}

.beyond-workspace .kind-button {
  display: flex;
  min-height: 2.9rem;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  border: 1px solid rgb(88 216 244 / 0.18);
  border-radius: 0.55rem;
  background: rgb(6 15 38 / 0.62);
  padding: 0 0.5rem;
  color: rgb(197 223 243 / 0.82);
  font-size: 0.88rem;
  font-weight: 820;
  transition: border-color 0.15s ease, background 0.15s ease, color 0.15s ease,
    box-shadow 0.15s ease;
}

.beyond-workspace .kind-icon {
  width: 1.05rem;
  height: 1.05rem;
  color: rgb(197 223 243 / 0.82);
}

.beyond-workspace .kind-button:hover {
  border-color: rgb(88 216 244 / 0.5);
}

.beyond-workspace .kind-button.active {
  border-color: #58d8f4;
  background: linear-gradient(135deg, rgb(79 141 247 / 0.5), rgb(88 216 244 / 0.24));
  color: #f2fbff;
  box-shadow: 0 0 1rem rgb(88 216 244 / 0.24);
}

.beyond-workspace .selected-count {
  min-width: 1.6rem;
  border-radius: 0.4rem;
  background: rgb(88 216 244 / 0.14);
  padding: 0.08rem 0.45rem;
  color: #58d8f4;
  font-size: 0.76rem;
  font-weight: 850;
  text-align: center;
}

.beyond-workspace .selected-groups {
  display: grid;
  gap: 0.55rem;
  margin-top: 0.7rem;
}

.beyond-workspace .selected-group {
  border: 1px solid rgb(88 216 244 / 0.12);
  border-radius: 0.55rem;
  background: rgb(0 0 0 / 0.18);
  padding: 0.6rem;
}

.beyond-workspace .selected-group h3 {
  margin-bottom: 0.45rem;
  color: #96c7ea;
  font-size: 0.76rem;
  font-weight: 850;
  letter-spacing: 0.06em;
}

.beyond-workspace .selected-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.36rem;
}

.beyond-workspace .selected-chip {
  display: inline-flex;
  min-height: 1.8rem;
  align-items: center;
  gap: 0.3rem;
  border: 1px solid rgb(88 216 244 / 0.34);
  border-radius: 9999px;
  background: rgb(88 216 244 / 0.12);
  padding: 0 0.55rem;
  color: #bee9fb;
  font-size: 0.8rem;
  font-weight: 800;
}

.beyond-workspace .empty-selected {
  margin-top: 0.65rem;
  border: 1px dashed rgb(88 216 244 / 0.2);
  border-radius: 0.55rem;
  padding: 0.8rem;
  color: rgb(215 236 252 / 0.55);
  font-size: 0.88rem;
  line-height: 1.55;
}

.beyond-workspace .stage {
  padding: 0.85rem 0.9rem 0.95rem;
}

.beyond-workspace .stage-heading {
  align-items: end;
  padding: 0.1rem 0.1rem 0.7rem;
}

.beyond-workspace .stage-heading p,
.beyond-workspace .filter-card-head p {
  color: #58d8f4;
  font-size: 0.68rem;
  font-weight: 850;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.beyond-workspace .stage-heading h2 {
  margin-top: 0.1rem;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 1.5rem;
  font-weight: 500;
  letter-spacing: 0.05em;
  color: #eef6ff;
}

.beyond-workspace .stage-heading span {
  color: rgb(215 236 252 / 0.5);
  font-size: 0.86rem;
}

.beyond-workspace .section-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.6rem;
}

.beyond-workspace .filter-card {
  padding: 0.72rem;
}

.beyond-workspace .filter-card.wide {
  grid-column: 1 / -1;
}

.beyond-workspace .filter-card-head {
  margin-bottom: 0.55rem;
}

.beyond-workspace .filter-card-head h3 {
  margin-top: 0.08rem;
  font-size: 1rem;
  font-weight: 850;
  color: #eef6ff;
}

.beyond-workspace .mini-reset {
  display: inline-flex;
  width: 1.6rem;
  height: 1.6rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border: 1px solid rgb(88 216 244 / 0.16);
  border-radius: 0.4rem;
  background: rgb(88 216 244 / 0.08);
  color: #58d8f4;
}

.beyond-workspace .option-cloud {
  display: flex;
  flex-wrap: wrap;
  gap: 0.36rem;
}

.beyond-workspace .option-cloud.single-line {
  flex-wrap: nowrap;
  overflow-x: auto;
  padding-bottom: 0.14rem;
}

.beyond-workspace .option-cloud.dense {
  gap: 0.3rem;
}

.beyond-workspace .option-cloud.numeric {
  flex-wrap: nowrap;
  gap: 0.32rem;
}

.beyond-workspace .option-pill {
  display: inline-flex;
  min-height: 2rem;
  align-items: center;
  justify-content: center;
  gap: 0.28rem;
  border: 1px solid rgb(88 216 244 / 0.2);
  border-radius: 9999px;
  background: rgb(6 15 38 / 0.62);
  padding: 0 0.68rem;
  color: rgb(189 213 233 / 0.86);
  font-size: 0.85rem;
  font-weight: 760;
  line-height: 1;
  transition: border-color 0.12s ease, background 0.12s ease, color 0.12s ease,
    box-shadow 0.12s ease;
}

.beyond-workspace .option-pill:hover {
  border-color: rgb(88 216 244 / 0.5);
}

.beyond-workspace .option-pill.active {
  border-color: #58d8f4;
  background: linear-gradient(135deg, #4f8df7, #58d8f4);
  color: #f6fcff;
  box-shadow: 0 0 0.85rem rgb(88 216 244 / 0.36);
}

.beyond-workspace .number-pill {
  width: 2.1rem;
  flex: 0 0 2.1rem;
  padding: 0;
}

.beyond-workspace .stat-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.5rem;
}

.beyond-workspace .stat-grid label {
  display: grid;
  gap: 0.28rem;
}

.beyond-workspace .stat-grid span {
  color: rgb(214 236 255 / 0.6);
  font-size: 0.8rem;
  font-weight: 750;
}

@media (max-width: 76rem) {
  .beyond-hero,
  .beyond-workspace {
    grid-template-columns: 1fr;
  }

  .beyond-hero .search-form {
    grid-template-columns: 1fr 1fr;
  }

  .beyond-workspace .kind-list {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media (max-width: 52rem) {
  .beyond-hero .search-form,
  .beyond-workspace .kind-list,
  .beyond-workspace .section-grid,
  .beyond-workspace .stat-grid {
    grid-template-columns: 1fr;
  }

  .beyond-shell .query-strip {
    align-items: stretch;
    flex-direction: column;
  }
}

/* ============================================================
   Evolve：卡牌档案目录（直角、分割线、索引编号、金色激活）
   ============================================================ */

.advanced-root.evolve {
  --evolve-cyan: #51ddea;
  --evolve-gold: #edc15f;
  --evolve-line: rgb(81 221 234 / 20%);
  --evolve-muted-line: rgb(237 193 95 / 20%);
  color: #edf6f2;
}

.evolve-shell {
  display: grid;
  gap: 1.1rem;
}

.evolve-hero {
  display: grid;
  grid-template-columns: minmax(15rem, 0.6fr) minmax(25rem, 1.4fr);
  gap: 2.4rem;
  align-items: end;
  padding: 1.1rem 0 1.3rem;
  border-top: 1px solid var(--evolve-line);
  border-bottom: 1px solid var(--evolve-line);
}

.evolve-hero .eyebrow {
  color: var(--evolve-cyan);
  letter-spacing: 0.18em;
}

.evolve-hero .eyebrow-index {
  display: inline-block;
  margin-right: 0.4rem;
  color: var(--evolve-gold);
}

.evolve-hero h1 {
  margin-top: 0.4rem;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: clamp(1.9rem, 3.2vw, 2.8rem);
  font-weight: 500;
  letter-spacing: 0.08em;
  line-height: 1.08;
  color: #f4f8f4;
}

.evolve-hero .hero-note {
  margin-top: 0.5rem;
  color: rgb(213 232 226 / 0.56);
  font-size: 0.92rem;
  line-height: 1.6;
}

.evolve-hero .search-form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 7rem 7.6rem;
  gap: 0;
  border: 1px solid var(--evolve-line);
}

.evolve-hero .keyword-input,
.evolve-hero .select-input {
  height: 2.9rem;
  border: 0;
  border-right: 1px solid var(--evolve-line);
  border-radius: 0;
  background: rgb(4 15 22 / 72%);
  padding: 0 0.8rem;
  color: #dcece7;
  font-size: 0.86rem;
  font-weight: 700;
  outline: none;
}

.evolve-hero .keyword-input:focus,
.evolve-hero .select-input:focus {
  background: rgb(6 20 28 / 78%);
  box-shadow: inset 0 -2px 0 var(--evolve-cyan);
}

.evolve-hero .keyword-input::placeholder {
  color: rgb(178 205 197 / 0.5);
}

.evolve-hero .search-button {
  display: inline-flex;
  height: 2.9rem;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  border: 0;
  background: var(--evolve-gold);
  color: #111718;
  font-size: 0.86rem;
  font-weight: 800;
}

.evolve-shell .query-strip {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  padding: 0.2rem 0 0.6rem;
  border-bottom: 1px solid var(--evolve-muted-line);
}

.evolve-shell .strip-caret {
  margin-right: 0.45rem;
  color: var(--evolve-gold);
  font-weight: 850;
}

.evolve-shell .query-strip code {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  color: #c8e2dc;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.8rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.evolve-shell .strip-button {
  display: inline-flex;
  flex-shrink: 0;
  height: 2.1rem;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  border: 1px solid var(--evolve-line);
  background: transparent;
  padding: 0 0.75rem;
  color: var(--evolve-cyan);
  font-size: 0.82rem;
  font-weight: 850;
}

.evolve-workspace {
  display: grid;
  grid-template-columns: 13.5rem minmax(0, 1fr);
  gap: 2.2rem;
  align-items: start;
}

.evolve-workspace .index-column {
  display: grid;
  gap: 1.4rem;
}

.evolve-workspace .kind-panel {
  padding-bottom: 1.2rem;
  border-bottom: 1px solid var(--evolve-muted-line);
}

.evolve-workspace .panel-caption {
  color: var(--evolve-cyan);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.68rem;
  font-weight: 850;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.evolve-workspace .kind-list {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0;
  margin-top: 0.55rem;
}

.evolve-workspace .kind-button {
  display: grid;
  grid-template-columns: 2.2rem 1.2rem minmax(0, 1fr);
  min-height: 2.6rem;
  align-items: center;
  gap: 0.4rem;
  border: 0;
  border-bottom: 1px solid rgb(81 221 234 / 10%);
  border-radius: 0;
  background: transparent;
  padding: 0 0.3rem;
  color: #a9bcb8;
  font-size: 0.9rem;
  font-weight: 780;
  text-align: left;
  transition: background 0.15s ease, color 0.15s ease;
}

.evolve-workspace .kind-no {
  color: rgb(237 193 95 / 0.55);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.68rem;
  letter-spacing: 0.1em;
}

.evolve-workspace .kind-icon {
  width: 1rem;
  height: 1rem;
  color: rgb(81 221 234 / 0.6);
}

.evolve-workspace .kind-button:hover,
.evolve-workspace .kind-button.active {
  border-bottom-color: var(--evolve-gold);
  background: linear-gradient(90deg, rgb(237 193 95 / 14%), transparent 85%);
  color: #fff4cd;
}

.evolve-workspace .kind-button.active .kind-no {
  color: var(--evolve-gold);
}

.evolve-workspace .selected-panel {
  padding: 0 0.2rem;
}

.evolve-workspace .selected-groups {
  display: grid;
  gap: 0.6rem;
  margin-top: 0.7rem;
}

.evolve-workspace .selected-group {
  padding-left: 0.75rem;
  border-left: 2px solid var(--evolve-line);
}

.evolve-workspace .selected-group h3 {
  margin-bottom: 0.4rem;
  color: #dceae6;
  font-size: 0.76rem;
  font-weight: 850;
  letter-spacing: 0.06em;
}

.evolve-workspace .selected-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.36rem;
}

.evolve-workspace .selected-chip {
  display: inline-flex;
  min-height: 1.8rem;
  align-items: center;
  gap: 0.3rem;
  border: 1px solid rgb(237 193 95 / 35%);
  border-radius: 0;
  background: rgb(237 193 95 / 8%);
  padding: 0 0.55rem;
  color: #f7df9b;
  font-size: 0.8rem;
  font-weight: 800;
}

.evolve-workspace .empty-selected {
  margin-top: 0.7rem;
  padding: 0.4rem 0.75rem;
  border-left: 1px dashed var(--evolve-muted-line);
  color: rgb(200 226 220 / 0.5);
  font-size: 0.88rem;
  line-height: 1.55;
}

.evolve-workspace .stage {
  padding: 0;
  background: transparent;
  box-shadow: none;
}

.evolve-workspace .stage-heading {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 1rem;
  padding: 0 0 0.9rem;
  border-bottom: 1px solid var(--evolve-line);
}

.evolve-workspace .stage-heading p,
.evolve-workspace .filter-card-head p {
  color: var(--evolve-cyan);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.66rem;
  font-weight: 850;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.evolve-workspace .stage-heading h2 {
  margin-top: 0.14rem;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 1.55rem;
  font-weight: 500;
  letter-spacing: 0.08em;
  color: #f1f6f3;
}

.evolve-workspace .stage-heading span {
  color: rgb(200 226 220 / 0.5);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.8rem;
}

.evolve-workspace .section-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0;
}

.evolve-workspace .filter-card {
  display: grid;
  grid-template-columns: 10rem minmax(0, 1fr);
  gap: 1.1rem;
  padding: 1.05rem 0;
  border: 0;
  border-bottom: 1px solid var(--evolve-muted-line);
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.evolve-workspace .filter-card.wide {
  grid-column: auto;
}

.evolve-workspace .filter-card-head {
  align-items: flex-start;
  margin: 0;
}

.evolve-workspace .filter-card-head h3 {
  margin-top: 0.1rem;
  font-size: 1.02rem;
  font-weight: 850;
  color: #f1f6f3;
}

.evolve-workspace .mini-reset {
  display: inline-flex;
  width: 1.7rem;
  height: 1.7rem;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--evolve-line);
  border-radius: 0;
  background: transparent;
  color: var(--evolve-cyan);
}

.evolve-workspace .option-cloud,
.evolve-workspace .stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(3.2rem, max-content));
  gap: 0.4rem;
  align-content: start;
  padding: 0;
  overflow: visible;
}

.evolve-workspace .option-cloud.single-line {
  display: flex;
  flex-wrap: nowrap;
  overflow-x: auto;
  padding-bottom: 0.2rem;
}

.evolve-workspace .option-cloud.numeric {
  display: flex;
  flex-wrap: nowrap;
  gap: 0.32rem;
}

.evolve-workspace .option-pill,
.evolve-workspace .number-pill {
  min-height: 2.3rem;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--evolve-line);
  border-radius: 0;
  background: rgb(5 18 23 / 52%);
  padding: 0 0.7rem;
  color: #b8cbc7;
  font-size: 0.85rem;
  font-weight: 760;
  line-height: 1;
  transition: border-color 0.12s ease, background 0.12s ease, color 0.12s ease;
}

.evolve-workspace .number-pill {
  width: 2.3rem;
  flex: 0 0 2.3rem;
  padding: 0;
}

.evolve-workspace .option-pill:hover,
.evolve-workspace .number-pill:hover,
.evolve-workspace .option-pill.active,
.evolve-workspace .number-pill.active {
  border-color: var(--evolve-gold);
  background: rgb(237 193 95 / 14%);
  color: #fff2c8;
}

.evolve-workspace .stat-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.evolve-workspace .stat-grid label {
  display: grid;
  gap: 0.3rem;
  padding: 0.5rem 0.6rem;
  border: 1px solid var(--evolve-line);
  border-radius: 0;
  background: rgb(5 18 23 / 52%);
}

.evolve-workspace .stat-grid span {
  color: var(--evolve-cyan);
  font-size: 0.78rem;
  font-weight: 750;
}

.evolve-workspace .stat-grid input {
  min-width: 0;
  height: 2.1rem;
  border: 0;
  border-radius: 0;
  background: transparent;
  padding: 0;
  color: #eaf4ef;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.92rem;
  font-weight: 800;
  outline: none;
}

.evolve-workspace .stat-grid input::placeholder {
  color: rgb(178 205 197 / 0.4);
}

@media (max-width: 76rem) {
  .evolve-hero,
  .evolve-workspace {
    grid-template-columns: 1fr;
  }

  .evolve-hero .search-form {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 52rem) {
  .evolve-hero .search-form,
  .evolve-workspace .filter-card,
  .evolve-workspace .stat-grid {
    grid-template-columns: 1fr;
  }

  .evolve-workspace .filter-card-head {
    grid-column: auto;
  }

  .evolve-shell .query-strip {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>