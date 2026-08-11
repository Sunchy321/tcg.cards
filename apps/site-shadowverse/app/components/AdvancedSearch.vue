<template>
  <section class="advanced-shell">
    <section class="hero">
      <div class="hero-content">
        <div>
          <p class="eyebrow">Advanced Search</p>
          <h1>{{ catalog.title }}高级搜索</h1>
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
      </div>
    </section>

    <div class="query-strip">
      <code>{{ queryText === '' ? '尚未选择筛选条件' : queryText }}</code>
      <button type="button" class="strip-button" @click="resetAll">
        <UIcon name="lucide:rotate-ccw" class="size-4" />
        重置
      </button>
    </div>

    <div class="workspace">
      <aside class="control-panel">
        <section class="panel-block">
          <div class="panel-head">
            <h2>卡牌种类</h2>
            <button type="button" class="text-button" @click="setKind('all')">
              清空
            </button>
          </div>

          <div class="kind-grid">
            <button
              v-for="kind in catalog.cardKinds"
              :key="kind.value"
              type="button"
              class="kind-button"
              :class="{ active: cardKind === kind.value }"
              @click="setKind(kind.value)"
            >
              <UIcon :name="kind.icon" class="size-4" />
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

          <p v-else class="empty-selected">
            还没有选择条件。
          </p>
        </section>
      </aside>

      <section class="option-stage">
        <div class="stage-heading">
          <div>
            <p>{{ currentKindLabel }}</p>
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
            <div class="filter-card-header">
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
            <div class="filter-card-header">
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
  </section>
</template>

<script setup lang="ts">
import type { CardCatalog, FilterSection } from '~/composables/cardCatalog';

const props = defineProps<{
  catalog: CardCatalog;
}>();

type CardKind = string;

const router = useRouter();

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
.advanced-shell {
  color: #eff6ff;
}

.hero,
.query-strip,
.control-panel,
.option-stage {
  border: 1px solid rgb(191 219 254 / 0.13);
  border-radius: 0.5rem;
  background: rgb(14 20 38 / 0.94);
  box-shadow: 0 0.7rem 1.6rem rgb(0 0 0 / 0.18);
}

.hero {
  overflow: hidden;
}

.hero-content {
  display: grid;
  grid-template-columns: minmax(14rem, 0.56fr) minmax(24rem, 1.44fr);
  gap: 0.9rem;
  align-items: end;
  padding: 0.75rem 0.85rem 0.95rem;
}

.eyebrow {
  color: rgb(147 197 253 / 0.82);
  font-size: 0.68rem;
  font-weight: 850;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

h1 {
  margin-top: 0.18rem;
  font-size: 1.85rem;
  font-weight: 900;
  line-height: 1.06;
}

.search-form {
  display: grid;
  grid-template-columns: minmax(14rem, 1fr) 7.5rem 8rem 5.8rem;
  gap: 0.5rem;
}

.keyword-input,
.select-input,
.stat-grid input {
  height: 2.35rem;
  min-width: 0;
  border: 1px solid rgb(191 219 254 / 0.16);
  border-radius: 0.4rem;
  background: rgb(15 23 42 / 0.68);
  padding: 0 0.7rem;
  color: #eff6ff;
  font-size: 0.86rem;
  font-weight: 700;
  outline: none;
}

.keyword-input::placeholder,
.stat-grid input::placeholder {
  color: rgb(191 219 254 / 0.46);
}

.keyword-input:focus,
.select-input:focus,
.stat-grid input:focus {
  border-color: rgb(96 165 250 / 0.72);
  box-shadow: 0 0 0 3px rgb(96 165 250 / 0.12);
}

.search-button,
.strip-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  border-radius: 0.4rem;
  font-weight: 850;
}

.search-button {
  height: 2.35rem;
  border: 1px solid rgb(147 197 253 / 0.58);
  background: #3b82f6;
  color: #eff6ff;
  font-size: 0.86rem;
}

.query-strip {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-top: 0.7rem;
  padding: 0.6rem 0.7rem;
}

.query-strip code {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  color: rgb(239 246 255 / 0.68);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.78rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.strip-button {
  height: 2rem;
  border: 1px solid rgb(191 219 254 / 0.16);
  background: rgb(255 255 255 / 0.07);
  padding: 0 0.7rem;
  color: rgb(239 246 255 / 0.78);
  font-size: 0.82rem;
}

.workspace {
  display: grid;
  grid-template-columns: 16rem 1fr;
  gap: 0.75rem;
  margin-top: 0.75rem;
}

.control-panel {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  align-self: start;
  padding: 0.65rem;
}

.panel-block,
.selected-panel,
.filter-card {
  border: 1px solid rgb(191 219 254 / 0.11);
  border-radius: 0.5rem;
  background: rgb(15 23 42 / 0.58);
}

.panel-block,
.selected-panel {
  padding: 0.75rem;
}

.panel-head,
.filter-card-header,
.stage-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.8rem;
}

.panel-head h2 {
  font-size: 1rem;
  font-weight: 850;
}

.text-button {
  color: rgb(147 197 253 / 0.86);
  font-size: 0.86rem;
  font-weight: 750;
}

.selected-count {
  min-width: 1.6rem;
  border-radius: 9999px;
  background: rgb(96 165 250 / 0.14);
  padding: 0.1rem 0.45rem;
  color: #bfdbfe;
  font-size: 0.76rem;
  font-weight: 850;
  text-align: center;
}

.kind-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.4rem;
  margin-top: 0.6rem;
}

.kind-button {
  display: flex;
  min-height: 2.5rem;
  align-items: center;
  justify-content: center;
  gap: 0.38rem;
  border: 1px solid rgb(191 219 254 / 0.12);
  border-radius: 0.4rem;
  background: rgb(255 255 255 / 0.05);
  color: rgb(239 246 255 / 0.74);
  font-size: 0.86rem;
  font-weight: 820;
}

.kind-button.active {
  border-color: rgb(96 165 250 / 0.7);
  background: rgb(96 165 250 / 0.14);
  color: #dbeafe;
}

.selected-groups {
  display: grid;
  gap: 0.55rem;
  margin-top: 0.7rem;
}

.selected-group {
  border: 1px solid rgb(191 219 254 / 0.1);
  border-radius: 0.45rem;
  background: rgb(0 0 0 / 0.16);
  padding: 0.6rem;
}

.selected-group h3 {
  margin-bottom: 0.45rem;
  color: rgb(147 197 253 / 0.82);
  font-size: 0.76rem;
  font-weight: 850;
  letter-spacing: 0.06em;
}

.selected-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.36rem;
}

.selected-chip {
  display: inline-flex;
  min-height: 1.8rem;
  align-items: center;
  gap: 0.3rem;
  border-radius: 9999px;
  padding: 0 0.55rem;
  font-size: 0.8rem;
  font-weight: 800;
}

.selected-chip {
  border: 1px solid rgb(96 165 250 / 0.34);
  background: rgb(96 165 250 / 0.13);
  color: #bfdbfe;
}

.empty-selected {
  margin-top: 0.65rem;
  border: 1px dashed rgb(191 219 254 / 0.18);
  border-radius: 0.45rem;
  padding: 0.8rem;
  color: rgb(239 246 255 / 0.58);
  font-size: 0.88rem;
  line-height: 1.55;
}

.option-stage {
  padding: 0.7rem;
}

.stage-heading {
  align-items: end;
  padding: 0.1rem 0.1rem 0.65rem;
}

.stage-heading p,
.filter-card-header p,
.field-label {
  color: rgb(147 197 253 / 0.76);
  font-size: 0.7rem;
  font-weight: 850;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.stage-heading h2 {
  margin-top: 0.12rem;
  font-size: 1.35rem;
  font-weight: 900;
}

.stage-heading span {
  color: rgb(239 246 255 / 0.52);
  font-size: 0.86rem;
}

.section-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.6rem;
}

.filter-card {
  padding: 0.65rem;
}

.filter-card.wide {
  grid-column: 1 / -1;
}

.filter-card-header {
  margin-bottom: 0.5rem;
}

.filter-card-header h3 {
  margin-top: 0.08rem;
  font-size: 1rem;
  font-weight: 850;
}

.mini-reset {
  display: inline-flex;
  width: 1.55rem;
  height: 1.55rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 0.35rem;
  background: rgb(255 255 255 / 0.07);
  color: rgb(191 219 254 / 0.72);
}

.option-cloud {
  display: flex;
  flex-wrap: wrap;
  gap: 0.34rem;
}

.option-cloud.single-line {
  flex-wrap: nowrap;
  overflow-x: auto;
  padding-bottom: 0.12rem;
}

.option-cloud.dense {
  gap: 0.28rem;
}

.option-cloud.numeric {
  flex-wrap: nowrap;
  gap: 0.3rem;
}

.option-pill {
  display: inline-flex;
  min-height: 2rem;
  align-items: center;
  justify-content: center;
  gap: 0.28rem;
  border: 1px solid rgb(191 219 254 / 0.12);
  border-radius: 9999px;
  background: rgb(0 0 0 / 0.18);
  padding: 0 0.66rem;
  color: rgb(239 246 255 / 0.84);
  font-size: 0.85rem;
  font-weight: 760;
  line-height: 1;
  transition: border-color 0.12s ease, background 0.12s ease, color 0.12s ease;
}

.option-pill:hover {
  border-color: rgb(96 165 250 / 0.4);
}

.option-pill.active {
  border-color: rgb(96 165 250 / 0.82);
  background: #3b82f6;
  color: #eff6ff;
}

.number-pill {
  width: 2.05rem;
  flex: 0 0 2.05rem;
  padding: 0;
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.5rem;
}

.stat-grid label {
  display: grid;
  gap: 0.28rem;
}

.stat-grid span {
  color: rgb(239 246 255 / 0.62);
  font-size: 0.82rem;
  font-weight: 750;
}

@media (max-width: 76rem) {
  .hero-content,
  .workspace {
    grid-template-columns: 1fr;
  }

  .search-form {
    grid-template-columns: 1fr 1fr;
  }

  .control-panel {
    display: grid;
    grid-template-columns: 16rem 1fr;
  }
}

@media (max-width: 52rem) {
  .search-form,
  .control-panel,
  .section-grid,
  .stat-grid {
    grid-template-columns: 1fr;
  }

  .query-strip {
    align-items: stretch;
    flex-direction: column;
  }

  .option-cloud.single-line {
    overflow-x: auto;
    padding-bottom: 0.2rem;
  }
}
</style>
