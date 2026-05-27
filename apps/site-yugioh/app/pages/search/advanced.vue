<template>
  <main class="advanced-page">
    <section class="search-shell">
      <header class="hero">
        <NuxtLink to="/" class="back-link">
          <UIcon name="lucide:arrow-left" class="size-4" />
          游戏王首页
        </NuxtLink>

        <div class="hero-content">
          <div>
            <p class="eyebrow">Advanced Search</p>
            <h1>游戏王高级搜索</h1>
          </div>

          <form class="search-form" @submit.prevent="submit">
            <input
              v-model="keyword"
              class="keyword-input"
              placeholder="请输入关键字"
            >
            <select v-model="language" class="select-input" aria-label="搜索语言">
              <option value="zhs">简体中文</option>
              <option value="en">English</option>
              <option value="ja">日本語</option>
            </select>
            <select v-model="field" class="select-input" aria-label="搜索范围">
              <option value="name">搜索卡名</option>
              <option value="card_text">卡片效果文本检索</option>
              <option value="pendulum_text">灵摆效果检索</option>
              <option value="number">卡片编号检索</option>
            </select>
            <button type="submit" class="search-button">
              <UIcon name="lucide:search" class="size-4" />
              搜索
            </button>
          </form>
        </div>
      </header>

      <div class="workspace">
        <aside class="control-panel">
          <section class="panel-block">
            <div class="panel-head">
              <h2>卡种</h2>
              <button type="button" class="text-button" @click="resetAll">
                清空
              </button>
            </div>

            <div class="kind-grid">
              <button
                v-for="kind in cardKinds"
                :key="kind.value"
                type="button"
                class="kind-button"
                :class="{ active: cardKind === kind.value }"
                @click="setCardKind(kind.value)"
              >
                <UIcon :name="kind.icon" class="size-4" />
                <span>{{ kind.label }}</span>
              </button>
            </div>
          </section>

          <section class="selected-panel">
            <div class="panel-head">
              <h2>已选条件</h2>
              <button type="button" class="text-button" @click="resetAll">
                清空
              </button>
            </div>

            <div v-if="selectedGroups.length > 0 || linkArrowChips.length > 0 || statChips.length > 0" class="selected-groups">
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

              <div v-if="linkArrowChips.length > 0" class="selected-group">
                <h3>连接箭头</h3>
                <div class="selected-list">
                  <button
                    v-for="chip in linkArrowChips"
                    :key="chip.value"
                    type="button"
                    class="selected-chip"
                    @click="toggleLinkArrow(chip.value)"
                  >
                    {{ chip.label }}
                    <UIcon name="lucide:x" class="size-3" />
                  </button>
                  <span v-if="linkArrowChips.length > 1" class="selected-mode">
                    {{ linkMode }}
                  </span>
                </div>
              </div>

              <div v-if="statChips.length > 0" class="selected-group">
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
            <span>{{ visibleSections.length }} 组条件</span>
          </div>

          <div class="section-grid">
            <section
              v-for="section in visibleSections"
              :key="section.id"
              class="filter-card"
              :class="{ wide: section.wide, compact: section.compact, balanced: section.balanced, 'place-right': section.place === 'right' }"
            >
              <div class="filter-card-header">
                <div>
                  <p>{{ section.caption }}</p>
                  <h3>{{ section.label }}</h3>
                </div>
                <button
                  type="button"
                  class="mini-reset"
                  aria-label="清除此组条件"
                  @click="clearSection(section.id)"
                >
                  <UIcon name="lucide:rotate-ccw" class="size-3.5" />
                </button>
              </div>

              <div
                class="option-cloud"
                :class="{ dense: section.dense, 'single-line': section.singleLine }"
              >
                <button
                  v-for="option in section.options"
                  :key="option.value"
                  type="button"
                  class="option-pill"
                  :class="{ active: isSelected(section.id, option.value), gem: option.badge }"
                  @click="toggle(section.id, option.value)"
                >
                  <img
                    v-if="option.icon"
                    :src="option.icon"
                    :alt="option.label"
                    class="option-icon"
                  >
                  <span v-else-if="option.badge" class="badge">{{ option.badge }}</span>
                  {{ option.label }}
                </button>
              </div>

              <div v-if="section.variant === 'linkArrows'" class="link-arrow-area">
                <div class="link-arrow-grid">
                  <button
                    v-for="arrow in linkArrows"
                    :key="arrow.value"
                    type="button"
                    class="link-arrow"
                    :class="{ active: isLinkArrowSelected(arrow.value) }"
                    :style="{ gridArea: arrow.area }"
                    @click="toggleLinkArrow(arrow.value)"
                  >
                    {{ arrow.label }}
                  </button>
                  <div class="link-arrow-core" />
                </div>

                <div class="link-mode">
                  <label>
                    <input v-model="linkMode" type="radio" value="and">
                    and
                  </label>
                  <label>
                    <input v-model="linkMode" type="radio" value="or">
                    or
                  </label>
                </div>
              </div>
            </section>

            <section v-if="showMonsterStats" class="filter-card wide">
              <div class="filter-card-header">
                <div>
                  <p>Monster Stats</p>
                  <h3>攻击力 / 守备力</h3>
                </div>
                <button type="button" class="mini-reset" aria-label="清除数值条件" @click="clearStats">
                  <UIcon name="lucide:rotate-ccw" class="size-3.5" />
                </button>
              </div>

              <div class="stat-grid">
                <label>
                  <span>攻击下限</span>
                  <input v-model="attackMin" inputmode="numeric" placeholder="1500">
                </label>
                <label>
                  <span>攻击上限</span>
                  <input v-model="attackMax" inputmode="numeric" placeholder="3000">
                </label>
                <label>
                  <span>守备下限</span>
                  <input v-model="defenseMin" inputmode="numeric" placeholder="1000">
                </label>
                <label>
                  <span>守备上限</span>
                  <input v-model="defenseMax" inputmode="numeric" placeholder="2500">
                </label>
              </div>
            </section>
          </div>
        </section>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
type CardKind = 'all' | 'monster' | 'spell' | 'trap';

type FilterOption = {
  label: string;
  value: string;
  badge?: string;
  icon?: string;
};

type FilterSection = {
  id: string;
  label: string;
  caption: string;
  kinds: CardKind[];
  options: FilterOption[];
  wide?: boolean;
  dense?: boolean;
  singleLine?: boolean;
  compact?: boolean;
  balanced?: boolean;
  place?: 'right';
  variant?: 'linkArrows';
};

const router = useRouter();

const keyword = ref('');
const language = ref('zhs');
const field = ref('name');
const cardKind = ref<CardKind>('all');
const attackMin = ref('');
const attackMax = ref('');
const defenseMin = ref('');
const defenseMax = ref('');
const linkMode = ref<'and' | 'or'>('or');
const selected = reactive<Record<string, string[]>>({});
const selectedLinkArrows = ref<string[]>([]);

const linkArrows = [
  { label: '↖', value: 'left-up', area: 'leftUp' },
  { label: '↑', value: 'up', area: 'up' },
  { label: '↗', value: 'right-up', area: 'rightUp' },
  { label: '←', value: 'left', area: 'left' },
  { label: '→', value: 'right', area: 'right' },
  { label: '↙', value: 'left-down', area: 'leftDown' },
  { label: '↓', value: 'down', area: 'down' },
  { label: '↘', value: 'right-down', area: 'rightDown' },
];

const cardKinds: Array<{ label: string; value: CardKind; icon: string }> = [
  { label: '所有卡', value: 'all', icon: 'lucide:sparkles' },
  { label: '怪兽卡', value: 'monster', icon: 'lucide:swords' },
  { label: '魔法卡', value: 'spell', icon: 'lucide:wand-sparkles' },
  { label: '陷阱卡', value: 'trap', icon: 'lucide:shield-alert' },
];

const sections: FilterSection[] = [
  {
    id: 'attribute',
    label: '属性',
    caption: 'Monster Attribute',
    kinds: ['all', 'monster'],
    wide: true,
    singleLine: true,
    options: [
      { label: '暗属性', value: 'dark', badge: '暗', icon: '/yugioh-icons/attribute-dark-jp.png' },
      { label: '光属性', value: 'light', badge: '光', icon: '/yugioh-icons/attribute-light-jp.png' },
      { label: '地属性', value: 'earth', badge: '地', icon: '/yugioh-icons/attribute-earth-jp.png' },
      { label: '水属性', value: 'water', badge: '水', icon: '/yugioh-icons/attribute-water-jp.png' },
      { label: '炎属性', value: 'fire', badge: '炎', icon: '/yugioh-icons/attribute-fire-jp.png' },
      { label: '风属性', value: 'wind', badge: '风', icon: '/yugioh-icons/attribute-wind-jp.png' },
      { label: '神属性', value: 'divine', badge: '神', icon: '/yugioh-icons/attribute-divine-jp.png' },
    ],
  },
  {
    id: 'race',
    label: '种族',
    caption: 'Monster Type',
    kinds: ['all', 'monster'],
    wide: true,
    dense: true,
    options: [
      '魔法师族',
      '龙族',
      '不死族',
      '战士族',
      '兽战士族',
      '兽族',
      '鸟兽族',
      '恶魔族',
      '天使族',
      '昆虫族',
      '恐龙族',
      '爬虫类族',
      '鱼族',
      '海龙族',
      '水族',
      '炎族',
      '雷族',
      '岩石族',
      '植物族',
      '机械族',
      '念动力族',
      '幻神兽族',
      '创造神族',
      '幻龙族',
      '电子界族',
      '幻想魔族',
    ].map(label => ({ label, value: label })),
  },
  {
    id: 'monsterType',
    label: '怪兽项目',
    caption: 'Monster Tags',
    kinds: ['all', 'monster'],
    wide: true,
    options: [
      '通常',
      '效果',
      '仪式',
      '融合',
      '同调',
      '超量',
      '卡通',
      '灵魂',
      '联合',
      '二重',
      '协调',
      '反转',
      '灵摆',
      '特殊召唤',
      '连接',
    ].map(label => ({ label, value: label })),
  },
  {
    id: 'level',
    label: '等级 / 阶级',
    caption: 'Level / Rank',
    kinds: ['all', 'monster'],
    options: numberOptions(0, 13),
  },
  {
    id: 'scale',
    label: '灵摆刻度',
    caption: 'Pendulum Scale',
    kinds: ['all', 'monster'],
    options: numberOptions(0, 13),
  },
  {
    id: 'link',
    label: '连接值',
    caption: 'Link Rating',
    kinds: ['all', 'monster'],
    options: numberOptions(1, 6),
    balanced: true,
    variant: 'linkArrows',
  },
  {
    id: 'spellType',
    label: '魔法卡标记',
    caption: 'Spell Mark',
    kinds: ['all', 'spell'],
    compact: true,
    options: [
      { label: '通常', value: 'normal' },
      { label: '速攻', value: 'quick_play', icon: '/yugioh-icons/icon-quick-play.png' },
      { label: '永续', value: 'continuous', icon: '/yugioh-icons/icon-continuous.png' },
      { label: '装备', value: 'equip', icon: '/yugioh-icons/icon-equip.png' },
      { label: '场地', value: 'field', icon: '/yugioh-icons/icon-field.png' },
      { label: '仪式', value: 'ritual', icon: '/yugioh-icons/icon-ritual.png' },
    ],
  },
  {
    id: 'trapType',
    label: '陷阱卡标记',
    caption: 'Trap Mark',
    kinds: ['all', 'trap'],
    compact: true,
    place: 'right',
    options: [
      { label: '通常', value: 'normal' },
      { label: '永续', value: 'continuous', icon: '/yugioh-icons/icon-continuous.png' },
      { label: '反击', value: 'counter', icon: '/yugioh-icons/icon-counter.png' },
    ],
  },
];

const currentKindLabel = computed(() =>
  cardKinds.find(kind => kind.value === cardKind.value)?.label ?? '所有卡',
);

const visibleSections = computed(() =>
  sections.filter(section => section.kinds.includes(cardKind.value)),
);

const showMonsterStats = computed(() =>
  cardKind.value === 'all' || cardKind.value === 'monster',
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
    { key: 'defenseMin', label: '守备下限', value: defenseMin.value.trim() },
    { key: 'defenseMax', label: '守备上限', value: defenseMax.value.trim() },
  ];

  return stats
    .filter(stat => stat.value !== '')
    .map(stat => ({
      key: stat.key,
      label: `${stat.label}: ${stat.value}`,
    }));
});

const linkArrowChips = computed(() =>
  selectedLinkArrows.value.map(value => ({
    value,
    label: linkArrows.find(arrow => arrow.value === value)?.label ?? value,
  })),
);

useHead({
  title: 'Yu-Gi-Oh! Advanced Search | TCG Cards',
});

function numberOptions(from: number, to: number): FilterOption[] {
  return Array.from({ length: to - from + 1 }, (_, index) => {
    const value = String(from + index);
    return { label: value, value };
  });
}

function setCardKind(value: CardKind) {
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

  if (section === 'link') {
    selectedLinkArrows.value = [];
    linkMode.value = 'or';
  }
}

function clearStats() {
  attackMin.value = '';
  attackMax.value = '';
  defenseMin.value = '';
  defenseMax.value = '';
}

function isLinkArrowSelected(value: string) {
  return selectedLinkArrows.value.includes(value);
}

function toggleLinkArrow(value: string) {
  selectedLinkArrows.value = isLinkArrowSelected(value)
    ? selectedLinkArrows.value.filter(item => item !== value)
    : [...selectedLinkArrows.value, value];
}

function clearStat(key: string) {
  if (key === 'attackMin') {
    attackMin.value = '';
  }

  if (key === 'attackMax') {
    attackMax.value = '';
  }

  if (key === 'defenseMin') {
    defenseMin.value = '';
  }

  if (key === 'defenseMax') {
    defenseMax.value = '';
  }
}

function resetAll() {
  for (const section of Object.keys(selected)) {
    selected[section] = [];
  }

  clearStats();
  cardKind.value = 'all';
  selectedLinkArrows.value = [];
  linkMode.value = 'or';
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
    attackMin.value.trim() ? `atk>=${attackMin.value.trim()}` : '',
    attackMax.value.trim() ? `atk<=${attackMax.value.trim()}` : '',
    defenseMin.value.trim() ? `def>=${defenseMin.value.trim()}` : '',
    defenseMax.value.trim() ? `def<=${defenseMax.value.trim()}` : '',
    ...selectedLinkArrows.value.map(value => `linkArrow:${value}`),
    selectedLinkArrows.value.length > 1 ? `linkArrowMode:${linkMode.value}` : '',
  ];

  return parts.filter(Boolean).join(' ');
});

async function submit() {
  await router.push({
    path: '/search',
    query: queryText.value ? { q: queryText.value } : {},
  });
}
</script>

<style scoped>
.advanced-page {
  min-height: 100vh;
  padding: 1rem;
  background: linear-gradient(135deg, #120b08 0%, #21100c 52%, #09070a 100%);
  color: #fff7ed;
}

.search-shell {
  width: min(88rem, 100%);
  margin: 0 auto;
}

.hero {
  overflow: hidden;
  border: 1px solid rgb(254 215 170 / 0.14);
  border-radius: 0.8rem;
  background: #1a100c;
  box-shadow: 0 0.45rem 1.2rem rgb(0 0 0 / 0.22);
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  margin: 0.65rem 0.8rem 0;
  color: rgb(254 215 170 / 0.74);
  font-size: 0.76rem;
}

.hero-content {
  display: grid;
  grid-template-columns: minmax(13rem, 0.55fr) minmax(24rem, 1.45fr);
  gap: 0.8rem;
  align-items: end;
  padding: 0.7rem 0.8rem 0.85rem;
}

.eyebrow {
  color: rgb(253 186 116 / 0.82);
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

h1 {
  margin-top: 0.18rem;
  font-size: 1.72rem;
  font-weight: 900;
  line-height: 1.05;
}

.search-form {
  display: grid;
  grid-template-columns: minmax(14rem, 1fr) 7.2rem 8.4rem 5.7rem;
  gap: 0.45rem;
}

.keyword-input,
.select-input {
  height: 2.35rem;
  min-width: 0;
  border: 1px solid rgb(254 215 170 / 0.16);
  border-radius: 0.48rem;
  background: rgb(15 23 42 / 0.72);
  padding: 0 0.7rem;
  color: #fff7ed;
  font-size: 0.84rem;
  font-weight: 700;
  outline: none;
}

.keyword-input::placeholder {
  color: rgb(254 215 170 / 0.5);
}

.keyword-input:focus,
.select-input:focus {
  border-color: rgb(251 191 36 / 0.72);
  box-shadow: 0 0 0 3px rgb(251 191 36 / 0.12);
}

.search-button {
  display: inline-flex;
  height: 2.35rem;
  align-items: center;
  justify-content: center;
  gap: 0.28rem;
  border: 1px solid rgb(254 240 138 / 0.58);
  border-radius: 0.48rem;
  background: linear-gradient(180deg, #facc15, #c2410c);
  color: #1c1009;
  font-size: 0.84rem;
  font-weight: 900;
}

.workspace {
  display: grid;
  grid-template-columns: 15.5rem 1fr;
  gap: 0.7rem;
  margin-top: 0.7rem;
}

.control-panel,
.option-stage {
  border: 1px solid rgb(254 215 170 / 0.13);
  border-radius: 0.75rem;
  background: #160d0b;
}

.control-panel {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  align-self: start;
  padding: 0.65rem;
}

.panel-block,
.selected-panel {
  border-radius: 0.7rem;
  background: #211612;
  padding: 0.75rem;
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
}

.panel-head h2 {
  font-size: 1rem;
  font-weight: 850;
}

.text-button {
  color: rgb(253 186 116 / 0.86);
  font-size: 0.88rem;
}

.kind-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.35rem;
  margin-top: 0.55rem;
}

.kind-button {
  display: flex;
  min-height: 2.45rem;
  align-items: center;
  justify-content: center;
  gap: 0.38rem;
  border: 1px solid rgb(254 215 170 / 0.12);
  border-radius: 0.5rem;
  background: rgb(15 23 42 / 0.55);
  color: rgb(255 247 237 / 0.74);
  font-size: 0.88rem;
  font-weight: 800;
}

.kind-button.active {
  border-color: rgb(251 191 36 / 0.72);
  background: #3a2510;
  color: #fef3c7;
}

.selected-groups {
  display: grid;
  gap: 0.6rem;
  margin-top: 0.7rem;
}

.selected-group {
  border: 1px solid rgb(254 215 170 / 0.12);
  border-radius: 0.6rem;
  background: #111827;
  padding: 0.62rem;
}

.selected-group h3 {
  margin-bottom: 0.45rem;
  color: rgb(253 186 116 / 0.84);
  font-size: 0.78rem;
  font-weight: 850;
  letter-spacing: 0.08em;
}

.selected-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.38rem;
}

.selected-chip {
  display: inline-flex;
  min-height: 1.85rem;
  align-items: center;
  gap: 0.3rem;
  border: 1px solid rgb(251 191 36 / 0.34);
  border-radius: 9999px;
  background: #3a2a12;
  padding: 0 0.58rem;
  color: #fde68a;
  font-size: 0.82rem;
  font-weight: 800;
}

.selected-mode {
  display: inline-flex;
  min-height: 1.85rem;
  align-items: center;
  border-radius: 9999px;
  background: rgb(255 255 255 / 0.08);
  padding: 0 0.58rem;
  color: rgb(255 247 237 / 0.72);
  font-size: 0.78rem;
  font-weight: 800;
}

.empty-selected {
  margin-top: 0.65rem;
  border: 1px dashed rgb(254 215 170 / 0.2);
  border-radius: 0.6rem;
  padding: 0.85rem;
  color: rgb(255 247 237 / 0.58);
  font-size: 0.9rem;
  line-height: 1.55;
}

.option-stage {
  padding: 0.65rem;
}

.stage-heading {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.12rem 0.15rem 0.6rem;
}

.stage-heading p,
.filter-card-header p {
  color: rgb(253 186 116 / 0.76);
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.11em;
  text-transform: uppercase;
}

.stage-heading h2 {
  margin-top: 0.12rem;
  font-size: 1.32rem;
  font-weight: 900;
}

.stage-heading span {
  color: rgb(255 247 237 / 0.52);
  font-size: 0.86rem;
}

.section-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.55rem;
}

.filter-card {
  border: 1px solid rgb(254 215 170 / 0.12);
  border-radius: 0.65rem;
  background: #101722;
  padding: 0.58rem;
}

.filter-card.compact {
  min-height: 12rem;
  display: flex;
  flex-direction: column;
}

.filter-card.balanced {
  grid-row: span 2;
  align-self: stretch;
  display: flex;
  flex-direction: column;
}

.filter-card.wide {
  grid-column: 1 / -1;
}

.filter-card.place-right {
  grid-column: 2;
}

.filter-card-header {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 0.8rem;
  margin-bottom: 0.45rem;
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
  border-radius: 9999px;
  background: rgb(255 255 255 / 0.08);
  color: rgb(254 215 170 / 0.72);
}

.option-cloud {
  display: flex;
  flex-wrap: wrap;
  gap: 0.32rem;
}

.option-cloud.single-line {
  flex-wrap: nowrap;
  overflow-x: auto;
  padding-bottom: 0.12rem;
}

.option-cloud.dense {
  gap: 0.28rem;
}

.option-pill {
  display: inline-flex;
  min-height: 2rem;
  align-items: center;
  justify-content: center;
  gap: 0.26rem;
  border: 1px solid rgb(254 215 170 / 0.12);
  border-radius: 9999px;
  background: rgb(15 23 42 / 0.68);
  padding: 0 0.65rem;
  color: rgb(255 247 237 / 0.84);
  font-size: 0.86rem;
  font-weight: 750;
  line-height: 1;
  transition: border-color 0.12s ease, background 0.12s ease;
}

.option-icon {
  width: 1.2rem;
  height: 1.2rem;
  flex-shrink: 0;
  object-fit: contain;
}

.option-pill:hover {
  border-color: rgb(251 191 36 / 0.4);
}

.option-pill.active {
  border-color: rgb(251 191 36 / 0.8);
  background: #facc15;
  color: #1c1009;
}

.link-arrow-area {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  margin-top: 0.65rem;
  min-height: 9.2rem;
  flex: 1;
  border-radius: 0.55rem;
  border: 1px solid rgb(251 191 36 / 0.14);
  background:
    linear-gradient(135deg, rgb(251 191 36 / 0.08), transparent 42%),
    #0b1220;
  padding: 0.75rem;
}

.link-arrow-grid {
  display: grid;
  width: 7.2rem;
  height: 7.2rem;
  flex-shrink: 0;
  grid-template-areas:
    "leftUp up rightUp"
    "left core right"
    "leftDown down rightDown";
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, 1fr);
  gap: 0.18rem;
}

.link-arrow {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgb(254 215 170 / 0.18);
  border-radius: 0.18rem;
  background: #1e293b;
  color: rgb(255 247 237 / 0.82);
  font-size: 1.15rem;
  font-weight: 900;
}

.link-arrow.active {
  border-color: #facc15;
  background: #3a2a12;
  color: #facc15;
}

.link-arrow-core {
  grid-area: core;
  border: 1px solid rgb(254 215 170 / 0.18);
  border-radius: 0.18rem;
  background: rgb(255 255 255 / 0.06);
}

.link-mode {
  display: flex;
  align-self: start;
  gap: 0.6rem;
  border-radius: 9999px;
  border: 1px solid rgb(254 215 170 / 0.16);
  background: #211612;
  padding: 0.22rem 0.7rem;
  color: #fff7ed;
  font-size: 0.9rem;
  font-weight: 800;
}

.link-mode label {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

.badge {
  display: inline-flex;
  width: 1.14rem;
  height: 1.14rem;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  background: rgb(255 255 255 / 0.18);
  font-size: 0.68rem;
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.45rem;
}

.stat-grid label {
  display: grid;
  gap: 0.25rem;
}

.stat-grid span {
  color: rgb(255 247 237 / 0.62);
  font-size: 0.82rem;
  font-weight: 700;
}

.stat-grid input {
  height: 2.35rem;
  border: 1px solid rgb(254 215 170 / 0.16);
  border-radius: 0.46rem;
  background: rgb(15 23 42 / 0.68);
  padding: 0 0.58rem;
  color: #fff7ed;
  font-size: 0.9rem;
  outline: none;
}

.stat-grid input::placeholder {
  color: rgb(254 215 170 / 0.42);
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

  .filter-card.place-right {
    grid-column: auto;
  }
}

@media (max-width: 52rem) {
  .advanced-page {
    padding: 0.65rem;
  }

  .search-form,
  .control-panel,
  .section-grid,
  .stat-grid {
    grid-template-columns: 1fr;
  }

  .option-cloud.single-line {
    overflow-x: auto;
    padding-bottom: 0.2rem;
  }

  .link-arrow-area {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
