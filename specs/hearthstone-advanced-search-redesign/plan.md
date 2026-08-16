# 炉石传说高级搜索交互重构实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将高级搜索从独立页面迁移到 `/search` 页面的 USlideover 中

**Architecture:** 删除 `/search/advanced.vue`，在 `advanced-search.ts` 中添加 DSL→State 反向解析能力，在 `search/index.vue` 中添加 USlideover 承载筛选器表单。桌面端 `side="top"`，移动端 `side="bottom"`。

**Tech Stack:** Nuxt UI v4 (USlideover), #search/parser (DSL 解析)

**文件影响范围：**

| 操作 | 文件 |
|------|------|
| 修改 | `apps/site-hearthstone/app/composables/advanced-search.ts` |
| 修改 | `apps/site-hearthstone/app/pages/search/index.vue` |
| 删除 | `apps/site-hearthstone/app/pages/search/advanced.vue` |
| 删除 | `apps/site-hearthstone/app/components/search/FieldRow.vue` |

---

### Task 1: `advanced-search.ts` 添加 DSL→State 反向解析

**Files:**
- Modify: `apps/site-hearthstone/app/composables/advanced-search.ts`

- [ ] **Step 1: 添加 `parseIntoState` 函数**

在 `advanced-search.ts` 中新增 `parseIntoState`，利用 `#search/parser` 解析 DSL，将表达式树映射到 `AdvancedSearchState`。

在文件顶部添加导入：

```typescript
import Parser from '#search/parser';
import { simplify } from '#search/parser/simplify';
import type { Expression, SimpleExpr } from '#search/parser';
```

在 `buildOrder` 函数之后、`useAdvancedSearch` 之前添加以下代码：

```typescript
// ── Reverse parsing (DSL → State) ──────────────────────────────────────────

function applySimpleExpr(expr: SimpleExpr, state: AdvancedSearchState): void {
  const { cmd, op, args } = expr;

  switch (cmd) {
    // Multi-select chip fields
    case 'class':
      if (!state.classes.includes(args)) state.classes.push(args);
      break;
    case 'type':
      if (!state.types.includes(args)) state.types.push(args);
      break;
    case 'race':
      if (!state.races.includes(args)) state.races.push(args);
      break;
    case 'faction':
      if (!state.factions.includes(args)) state.factions.push(args);
      break;
    case 'spell-school':
      if (!state.spellSchools.includes(args)) state.spellSchools.push(args);
      break;
    case 'rarity':
      if (!state.rarities.includes(args)) state.rarities.push(args);
      break;

    // Numeric chip fields (exact match 0-9 → chip, operator → numeric input)
    case 'cost': {
      if (op === '=' && /^\d+$/.test(args) && Number(args) <= 10) {
        if (!state.costs.includes(args)) state.costs.push(args);
      } else {
        const slot = state.cost[0].value === '' ? 0 : 1;
        state.cost[slot] = { value: args, operator: op as NumericOperator };
      }
      break;
    }
    case 'attack': {
      if (op === '=' && /^\d+$/.test(args) && Number(args) <= 10) {
        if (!state.attacks.includes(args)) state.attacks.push(args);
      } else {
        const slot = state.attack[0].value === '' ? 0 : 1;
        state.attack[slot] = { value: args, operator: op as NumericOperator };
      }
      break;
    }
    case 'health': {
      if (op === '=' && /^\d+$/.test(args) && Number(args) <= 10) {
        if (!state.healths.includes(args)) state.healths.push(args);
      } else {
        const slot = state.health[0].value === '' ? 0 : 1;
        state.health[slot] = { value: args, operator: op as NumericOperator };
      }
      break;
    }

    // Select field
    case 'format':
      state.format = args;
      break;

    // Unknown commands silently ignored
  }
}

function applyExpr(expr: Expression, state: AdvancedSearchState): void {
  if (expr.type === 'raw') {
    state.keyword = expr.args;
    return;
  }

  if (expr.type === 'simple') {
    applySimpleExpr(expr, state);
    return;
  }

  // Handle (cost:3 | cost:4) OR groups for multi-value fields
  if (expr.type === 'paren' && expr.expr.type === 'logic' && expr.expr.sep === '|') {
    for (const sub of expr.expr.exprs) {
      if (sub.type === 'simple') {
        applySimpleExpr(sub, state);
      }
    }
  }
}

export function parseIntoState(text: string, state: AdvancedSearchState): void {
  const trimmed = text.trim();
  if (!trimmed) return;

  try {
    const expr = new Parser(trimmed).parse();
    const simplified = simplify(expr);

    // Flatten top-level AND groups
    const exprs: Expression[] = simplified.type === 'logic' && (simplified.sep === '' || simplified.sep === '&')
      ? simplified.exprs
      : [simplified];

    for (const e of exprs) {
      applyExpr(e, state);
    }
  } catch {
    // Parse error: leave state as-is (default/empty)
  }
}
```

- [ ] **Step 2: 更新 `useAdvancedSearch` 支持初始化 DSL**

将 `useAdvancedSearch` 改为可接受 `initialDsl` 参数：

```typescript
export const useAdvancedSearch = (initialDsl?: string) => {
  const defaultState = createDefaultState();
  const fresh = initialDsl ? structuredClone(defaultState) : defaultState;

  if (initialDsl) {
    parseIntoState(initialDsl, fresh);
  }

  const state = ref<AdvancedSearchState>(fresh);
  const searchInput = useSearchInput();

  const dsl = computed(() => buildAdvancedSearchDSL(state.value));

  watch(dsl, value => {
    searchInput.value = value;
  }, { immediate: true });

  const reset = () => {
    state.value = createDefaultState();
  };

  return {
    state,
    dsl,
    reset,
  };
};
```

> 注意：由于 `state` 对象包含嵌套对象（`cost`, `attack`, `health` 数组），`parseIntoState` 在 `fresh` 副本上操作可以确保 reactivity 正确建立。使用 `structuredClone` 进行深拷贝避免引用共享。

- [ ] **Step 3: 验证类型检查**

Run: `npx nuxt typecheck --dir apps/site-hearthstone`
Expected: 通过，无新类型错误

---

### Task 2: `search/index.vue` 添加 USlideover 高级搜索面板

**Files:**
- Modify: `apps/site-hearthstone/app/pages/search/index.vue`

- [ ] **Step 1: 在 `<script setup>` 中添加 Slideover 状态和 `useAdvancedSearch` 调用**

在 `apps/site-hearthstone/app/pages/search/index.vue` 的 script 部分添加：

```typescript
// 在现有 imports 之后添加
import { useAdvancedSearch } from '~/composables/advanced-search';

// 在现有 setup 代码末尾添加
const isAdvancedOpen = ref(false);
const route = useRoute();  // 如果已有 useRoute 则复用

const { state, dsl, reset } = useAdvancedSearch(route.query.q as string | undefined);

const advancedSearchUrl = computed(() =>
  dsl.value === '' ? undefined : `/search?q=${encodeURIComponent(dsl.value)}`
);

function openAdvanced() {
  isAdvancedOpen.value = true;
}

function closeAdvanced() {
  isAdvancedOpen.value = false;
}

function commitAdvancedSearch() {
  if (dsl.value === '') return;
  isAdvancedOpen.value = false;
  void navigateTo({ path: '/search', query: { q: dsl.value } });
}
```

- [ ] **Step 2: 添加 responsive 检测 composable**

由于项目未使用 `@vueuse/core`，用原生 `matchMedia`：

```typescript
// 和上面代码放在一起
const isMobile = ref(false);

onMounted(() => {
  const mql = window.matchMedia('(max-width: 768px)');
  isMobile.value = mql.matches;
  mql.addEventListener('change', (e) => { isMobile.value = e.matches; });
});
```

- [ ] **Step 3: 添加 USlideover 组件到模板**

在 `<template>` 的根 `<div>` 内、现有内容**之前**或**之后**（作为兄弟节点）添加 USlideover。位置在 Teleport 和内容区域之间，或全部内容之后：

```vue
<!-- 在 </Teleport> 后面、<div class="mx-auto..."> 之前添加 -->
<USlideover
  v-model:open="isAdvancedOpen"
  :side="isMobile ? 'bottom' : 'top'"
  inset
  :ui="{
    content: isMobile ? '' : 'max-h-[80vh]',
  }"
>
  <template #header>
    <div class="flex items-center gap-3 w-full">
      <code class="flex-1 min-w-0 truncate font-mono text-xs text-foreground/70">
        {{ dsl || $t('hearthstone.search.advanced.emptyQuery') }}
      </code>
      <UButton
        icon="lucide:rotate-ccw"
        variant="ghost"
        size="sm"
        @click="reset"
      >
        {{ $t('hearthstone.search.advanced.reset') }}
      </UButton>
    </div>
  </template>

  <template #body>
    <!-- 筛选器表单内容 - 从 advanced.vue 迁移 -->
    <!-- 关键词 -->
    <div class="mb-6">
      <div class="text-xs font-medium text-foreground/60 mb-2 flex items-center gap-1">
        <UIcon name="lucide:search" class="w-4 h-4" />
        {{ $t('hearthstone.search.advanced.keyword') }}
      </div>
      <FieldRow :label="$t('hearthstone.search.advanced.keyword')" icon="lucide:search">
        <UInput
          v-model="state.keyword"
          size="sm"
          class="w-full"
          :placeholder="$t('hearthstone.search.advanced.keywordPlaceholder')"
        />
      </FieldRow>
    </div>

    <!-- 身份属性 -->
    <div class="filter-panel mb-4">
      <div class="panel-header">
        <div class="panel-title">
          <UIcon name="lucide:layers" class="w-5 h-5" />
          <span>{{ $t('hearthstone.search.advanced.sectionIdentity') }}</span>
        </div>
        <div class="panel-divider"></div>
      </div>

      <div class="panel-content space-y-6">
        <!-- Cost -->
        <div class="filter-group">
          <div class="filter-group-title">
            <UIcon name="i:hearthstone-cost" class="w-5 h-5" />
            <span>{{ $t('hearthstone.search.command.cost') }}</span>
          </div>
          <div class="cost-buttons mb-3">
            <button
              v-for="item in costItems"
              :key="item.value"
              class="cost-btn"
              :class="{ active: state.costs.includes(item.value), 'cost-btn--plus': item.value === '10+' }"
              @click="toggleMulti(state.costs, item.value)"
            >
              <span class="cost-num">{{ item.label === '10+' ? '10' : item.label }}</span>
              <span v-if="item.value === '10+'" class="cost-plus">+</span>
            </button>
          </div>
          <div class="numeric-inputs">
            <div class="numeric-row">
              <USelect
                :model-value="state.cost[0].operator"
                :items="numericOperators"
                size="sm"
                class="w-20"
                @update:model-value="value => state.cost[0].operator = value as NumericOperator"
              />
              <UInput
                v-model="state.cost[0].value"
                size="sm"
                class="w-24"
                inputmode="numeric"
                :placeholder="$t('hearthstone.search.command.cost')"
              />
            </div>
            <div class="numeric-row">
              <USelect
                :model-value="state.cost[1].operator"
                :items="numericOperators"
                size="sm"
                class="w-20"
                @update:model-value="value => state.cost[1].operator = value as NumericOperator"
              />
              <UInput
                v-model="state.cost[1].value"
                size="sm"
                class="w-24"
                inputmode="numeric"
                :placeholder="$t('hearthstone.search.command.cost')"
              />
            </div>
          </div>
        </div>

        <!-- Class -->
        <div class="filter-group">
          <div class="filter-group-title">
            <UIcon name="i:hearthstone-class-neutral" class="w-5 h-5" />
            <span>{{ $t('hearthstone.search.command.class') }}</span>
          </div>
          <div class="chip-group">
            <button
              v-for="item in classItems"
              :key="item.value"
              class="chip-btn"
              :class="{ active: state.classes.includes(item.value) }"
              @click="toggleMulti(state.classes, item.value)"
            >
              <span class="chip-icon" :style="getClassColorStyle(item.value)"></span>
              <span class="chip-label-text">{{ item.label }}</span>
            </button>
          </div>
        </div>

        <!-- Type -->
        <div class="filter-group">
          <div class="filter-group-title">
            <UIcon name="lucide:tag" class="w-5 h-5" />
            <span>{{ $t('hearthstone.search.command.type') }}</span>
          </div>
          <div class="chip-group">
            <button
              v-for="item in typeItems"
              :key="item.value"
              class="chip-btn"
              :class="{ active: state.types.includes(item.value) }"
              @click="toggleMulti(state.types, item.value)"
            >
              <span class="chip-label-text">{{ item.label }}</span>
            </button>
          </div>
        </div>

        <!-- Race -->
        <div class="filter-group">
          <div class="filter-group-title">
            <UIcon name="lucide:paw-print" class="w-5 h-5" />
            <span>{{ $t('hearthstone.search.command.race') }}</span>
          </div>
          <div class="chip-group">
            <button
              v-for="item in raceItems"
              :key="item.value"
              class="chip-btn"
              :class="{ active: state.races.includes(item.value) }"
              @click="toggleMulti(state.races, item.value)"
            >
              <span class="chip-label-text">{{ item.label }}</span>
            </button>
          </div>
        </div>

        <!-- Faction -->
        <div class="filter-group">
          <div class="filter-group-title">
            <UIcon name="lucide:shield" class="w-5 h-5" />
            <span>{{ $t('hearthstone.search.command.faction') }}</span>
          </div>
          <div class="chip-group">
            <button
              v-for="item in factionItems"
              :key="item.value"
              class="chip-btn"
              :class="{ active: state.factions.includes(item.value) }"
              @click="toggleMulti(state.factions, item.value)"
            >
              <span class="chip-label-text">{{ item.label }}</span>
            </button>
          </div>
        </div>

        <!-- Spell School -->
        <div class="filter-group">
          <div class="filter-group-title">
            <UIcon name="lucide:sparkles" class="w-5 h-5" />
            <span>{{ $t('hearthstone.search.command.spell-school') }}</span>
          </div>
          <div class="chip-group">
            <button
              v-for="item in spellSchoolItems"
              :key="item.value"
              class="chip-btn"
              :class="{ active: state.spellSchools.includes(item.value) }"
              @click="toggleMulti(state.spellSchools, item.value)"
            >
              <span class="chip-label-text">{{ item.label }}</span>
            </button>
          </div>
        </div>

        <!-- Rarity -->
        <div class="filter-group">
          <div class="filter-group-title">
            <UIcon name="lucide:star" class="w-5 h-5" />
            <span>{{ $t('hearthstone.search.command.rarity') }}</span>
          </div>
          <div class="chip-group">
            <button
              v-for="item in rarityItems"
              :key="item.value"
              class="chip-btn"
              :class="{ active: state.rarities.includes(item.value) }"
              @click="toggleMulti(state.rarities, item.value)"
            >
              <span class="chip-label-text">{{ item.label }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 数值属性 -->
    <div class="filter-panel mb-4">
      <div class="panel-header">
        <div class="panel-title">
          <UIcon name="lucide:bar-chart-2" class="w-5 h-5" />
          <span>{{ $t('hearthstone.search.advanced.sectionStats') }}</span>
        </div>
        <div class="panel-divider"></div>
      </div>

      <div class="panel-content space-y-6">
        <!-- Attack -->
        <div class="filter-group">
          <div class="filter-group-title">
            <UIcon name="lucide:sword" class="w-5 h-5" />
            <span>{{ $t('hearthstone.search.command.attack') }}</span>
          </div>
          <div class="chip-group mb-3">
            <button
              v-for="item in attackItems"
              :key="item.value"
              class="chip-btn"
              :class="{ active: state.attacks.includes(item.value) }"
              @click="toggleMulti(state.attacks, item.value)"
            >
              <span class="chip-label-text">{{ item.label }}</span>
            </button>
          </div>
          <div class="numeric-inputs">
            <div class="numeric-row">
              <USelect
                :model-value="state.attack[0].operator"
                :items="numericOperators"
                size="sm"
                class="w-20"
                @update:model-value="value => state.attack[0].operator = value as NumericOperator"
              />
              <UInput
                v-model="state.attack[0].value"
                size="sm"
                class="w-24"
                inputmode="numeric"
                :placeholder="$t('hearthstone.search.command.attack')"
              />
            </div>
            <div class="numeric-row">
              <USelect
                :model-value="state.attack[1].operator"
                :items="numericOperators"
                size="sm"
                class="w-20"
                @update:model-value="value => state.attack[1].operator = value as NumericOperator"
              />
              <UInput
                v-model="state.attack[1].value"
                size="sm"
                class="w-24"
                inputmode="numeric"
                :placeholder="$t('hearthstone.search.command.attack')"
              />
            </div>
          </div>
        </div>

        <!-- Health -->
        <div class="filter-group">
          <div class="filter-group-title">
            <UIcon name="lucide:heart" class="w-5 h-5" />
            <span>{{ $t('hearthstone.search.command.health') }}</span>
          </div>
          <div class="chip-group mb-3">
            <button
              v-for="item in healthItems"
              :key="item.value"
              class="chip-btn"
              :class="{ active: state.healths.includes(item.value) }"
              @click="toggleMulti(state.healths, item.value)"
            >
              <span class="chip-label-text">{{ item.label }}</span>
            </button>
          </div>
          <div class="numeric-inputs">
            <div class="numeric-row">
              <USelect
                :model-value="state.health[0].operator"
                :items="numericOperators"
                size="sm"
                class="w-20"
                @update:model-value="value => state.health[0].operator = value as NumericOperator"
              />
              <UInput
                v-model="state.health[0].value"
                size="sm"
                class="w-24"
                inputmode="numeric"
                :placeholder="$t('hearthstone.search.command.health')"
              />
            </div>
            <div class="numeric-row">
              <USelect
                :model-value="state.health[1].operator"
                :items="numericOperators"
                size="sm"
                class="w-20"
                @update:model-value="value => state.health[1].operator = value as NumericOperator"
              />
              <UInput
                v-model="state.health[1].value"
                size="sm"
                class="w-24"
                inputmode="numeric"
                :placeholder="$t('hearthstone.search.command.health')"
              />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Format -->
    <div class="filter-panel mb-4">
      <div class="panel-header">
        <div class="panel-title">
          <UIcon name="lucide:book-open" class="w-5 h-5" />
          <span>{{ $t('hearthstone.search.advanced.sectionOrganization') }}</span>
        </div>
        <div class="panel-divider"></div>
      </div>

      <div class="panel-content">
        <FieldRow :label="$t('hearthstone.search.command.format')" icon="lucide:trophy">
          <USelect
            :model-value="state.format || undefined"
            :items="formatItems"
            size="sm"
            class="w-full"
            :placeholder="$t('hearthstone.search.advanced.any')"
            @update:model-value="value => state.format = (value as string) ?? ''"
          />
        </FieldRow>
      </div>
    </div>
  </template>

  <template #footer>
    <div class="flex items-center justify-between w-full">
      <UButton
        icon="lucide:library"
        size="sm"
        variant="soft"
        :to="{ path: '/sets' }"
      >
        {{ $t('hearthstone.search.advanced.browseSets') }}
      </UButton>
      <UButton
        icon="lucide:search"
        size="sm"
        :disabled="dsl === ''"
        @click="commitAdvancedSearch"
      >
        {{ $t('hearthstone.search.advanced.search') }}
      </UButton>
    </div>
  </template>
</USlideover>
```

- [ ] **Step 4: 修改"高级搜索"按钮从导航改为打开 Slideover**

在 Teleport 区域中，将高级搜索按钮从：

```vue
<UButton
  icon="lucide:sliders-horizontal"
  variant="outline"
  size="sm"
  color="primary"
  class="!text-white !ring-white"
  to="/search/advanced"
>
  {{ $t('hearthstone.search.advanced.$self') }}
</UButton>
```

改为：

```vue
<UButton
  icon="lucide:sliders-horizontal"
  variant="outline"
  size="sm"
  color="primary"
  class="!text-white !ring-white"
  @click="openAdvanced"
>
  {{ $t('hearthstone.search.advanced.$self') }}
</UButton>
```

- [ ] **Step 5: 从 `advanced.vue` 复制工具函数和 computed 属性到 index.vue**

从 `search/advanced.vue` 的 `<script setup>` 中复制以下函数/计算属性到 `search/index.vue` 的 script 中：

```typescript
// 从 advanced.vue 复制需要的 imports
import { classes, format, race, rarity, spellSchool, types } from '#model/hearthstone/schema/basic';

// 不需要再导入 useAdvancedSearch - 已在上面导入

// 计算属性
const costItems = computed(() => ([
  ...Array.from({ length: 10 }, (_, index) => {
    const value = String(index);
    return { value, label: value };
  }),
  { value: '10+', label: '10+' },
]));

const attackItems = computed(() => ([
  ...Array.from({ length: 10 }, (_, index) => {
    const value = String(index);
    return { value, label: value };
  }),
  { value: '10+', label: '10+' },
]));

const healthItems = computed(() => ([
  ...Array.from({ length: 10 }, (_, index) => {
    const value = String(index);
    return { value, label: value };
  }),
  { value: '10+', label: '10+' },
]));

const numericOperators = [
  { value: '>' as NumericOperator, label: '>' },
  { value: '>=' as NumericOperator, label: '>=' },
  { value: '<' as NumericOperator, label: '<' },
  { value: '<=' as NumericOperator, label: '<=' },
];

const makeItems = (prefix: string, values: readonly string[]) => {
  return values.map(value => ({
    value,
    label: t(`${prefix}.${value}`),
  }));
};

const classItems = computed(() => makeItems('hearthstone.class', ['death_knight', 'demon_hunter', 'druid', 'hunter', 'mage', 'paladin', 'priest', 'rogue', 'shaman', 'warlock', 'warrior', 'neutral']));
const formatItems = computed(() => makeItems('hearthstone.format', ['standard', 'wild', 'classic']));
const typeItems = computed(() => makeItems('hearthstone.card.type', ['minion', 'spell', 'weapon', 'hero', 'location']));
const raceItems = computed(() => makeItems('hearthstone.card.race', ['dragon', 'demon', 'beast', 'murloc', 'pirate', 'mech', 'elemental', 'naga', 'quilboar', 'totem', 'undead', 'draenei', 'all']));

const factionText = (value: string) => te(`hearthstone.search.parameter.faction.${value}`)
  ? t(`hearthstone.search.parameter.faction.${value}`)
  : value;

const factionItems = computed(() => ['all', 'grimy_goons', 'jade_lotus', 'kabal', 'zerg', 'human', 'protoss'].map(value => ({
  value,
  label: factionText(value),
})));

const spellSchoolItems = computed(() => makeItems('hearthstone.card.spellSchool', ['arcane', 'fire', 'frost', 'nature', 'holy', 'shadow', 'fel']));
const rarityItems = computed(() => makeItems('hearthstone.search.parameter.rarity', ['free', 'common', 'rare', 'epic', 'legendary']));

const toggleMulti = (values: string[], value: string) => {
  const index = values.indexOf(value);
  if (index >= 0) {
    values.splice(index, 1);
  } else {
    values.push(value);
  }
};

const classColors: Record<string, string> = {
  death_knight: '#C41E3A',
  demon_hunter: '#A33000',
  druid: '#FF7D0A',
  hunter: '#ABD473',
  mage: '#69CCF0',
  paladin: '#F58CBA',
  priest: '#FFFFFF',
  rogue: '#FFF569',
  shaman: '#0070DE',
  warlock: '#9482C9',
  warrior: '#C79C6E',
  neutral: '#9E9E9E',
};

const getClassColorStyle = (className: string) => {
  const color = classColors[className] ?? '#9E9E9E';
  return { backgroundColor: color };
};
```

- [ ] **Step 6: 添加筛选器面板样式**

从 `advanced.vue` 复制 `<style>` 块中的样式到 `index.vue` 的 `<style>` 块中（保持 `scoped`）。需要复制的样式包括：

```scss
// Filter Panel
.filter-panel {
  background: rgba(20, 35, 60, 0.75);
  border: 1px solid rgba(80, 120, 180, 0.25);
  border-radius: 16px;
  overflow: hidden;
  backdrop-filter: blur(10px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05);
}

.panel-header {
  padding: 16px 20px 0;
}

.panel-title {
  @apply flex items-center gap-2 text-base font-semibold text-blue-200 mb-3;

  svg {
    filter: drop-shadow(0 0 8px rgba(100, 180, 255, 0.5));
  }
}

.panel-divider {
  height: 1px;
  background: linear-gradient(90deg, transparent 0%, rgba(100, 150, 255, 0.4) 50%, transparent 100%);
  margin-bottom: 16px;
}

.panel-content {
  padding: 0 20px 20px;
}

.filter-group {
  margin-bottom: 24px;

  &:last-child {
    margin-bottom: 0;
  }
}

.filter-group-title {
  @apply flex items-center gap-2 text-sm font-medium text-blue-300/80 mb-2;

  svg {
    @apply w-4 h-4;
  }
}

.chip-group {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.chip-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid rgba(120, 160, 220, 0.5);
  background: rgba(18, 30, 52, 0.85);
  color: #eaf2ff;
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;

  &:hover {
    border-color: rgba(140, 180, 240, 0.7);
    background: rgba(25, 40, 65, 0.9);
  }

  &.active {
    background: linear-gradient(135deg, rgba(60, 120, 200, 0.85) 0%, rgba(40, 100, 180, 0.95) 100%);
    border-color: rgba(120, 180, 255, 0.7);
    color: #ffffff;
    box-shadow: 0 0 12px rgba(80, 160, 255, 0.4);
  }
}

.chip-icon {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  flex-shrink: 0;
  box-shadow: 0 0 6px rgba(0, 0, 0, 0.4), inset 0 1px 2px rgba(255, 255, 255, 0.3);
}

.chip-label-text {
  white-space: nowrap;
}

.cost-buttons {
  display: flex;
  flex-wrap: nowrap;
  gap: 4px;
}

.cost-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  cursor: pointer;
  transition: all 0.2s ease;
  background: none;
  border: none;
  padding: 0;
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.7));

  .cost-num {
    color: #ffffff;
    font-weight: bold;
    font-size: 16px;
    width: 100%;
    text-align: center;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9), 0 0 8px rgba(80, 160, 255, 0.5);
    position: relative;
    z-index: 1;
    line-height: 1;
  }

  .cost-plus {
    color: #ffffff;
    font-weight: bold;
    font-size: 12px;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
    position: absolute;
    right: 4px;
    top: 50%;
    transform: translateY(-50%);
    z-index: 1;
    line-height: 1;
  }

  &.cost-btn--plus {
    .cost-num {
      font-size: 14px;
      transform: translateX(-2px);
    }

    .cost-plus {
      font-size: 16px;
      right: 3px;
    }
  }

  &::before {
    content: '';
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    background-image: url(/icons/mana-crystal.png);
    background-size: contain;
    background-repeat: no-repeat;
    background-position: center;
    width: 34px;
    height: 34px;
    z-index: 0;
  }

  &:hover {
    filter: drop-shadow(0 2px 6px rgba(80, 160, 255, 0.8));
  }

  &.active {
    filter: drop-shadow(0 0 10px rgba(100, 180, 255, 1)) brightness(1.3);
  }
}

.numeric-inputs {
  @apply flex flex-col gap-2;
}

.numeric-row {
  @apply flex gap-2 items-center;
}
```

- [ ] **Step 7: 验证类型检查**

Run: `npx nuxt typecheck --dir apps/site-hearthstone`
Expected: 通过

---

### Task 3: 删除旧文件

**Files:**
- Delete: `apps/site-hearthstone/app/pages/search/advanced.vue`
- Delete: `apps/site-hearthstone/app/components/search/FieldRow.vue`

- [ ] **Step 1: 删除 `advanced.vue`**

```bash
rm apps/site-hearthstone/app/pages/search/advanced.vue
```

- [ ] **Step 2: 删除 `FieldRow.vue`**（仅被 `advanced.vue` 使用，已无其他引用）

```bash
rm apps/site-hearthstone/app/components/search/FieldRow.vue
```

- [ ] **Step 3: 验证类型检查**

Run: `npx nuxt typecheck --dir apps/site-hearthstone`
Expected: 通过

---

### Task 4: 清理与验证

- [ ] **Step 1: 检查 i18n 是否有未使用的 key**

`advanced.vue` 用到的 i18n key 已被迁移到 `index.vue` 的 Slideover 中。检查 `hearthstone.search.advanced` 下的 key 是否都被新模板引用。

- [ ] **Step 2: 完整性验证**

逐个验证以下流程：

1. 打开空搜索页 → 点击"高级搜索" → Slideover 打开（桌面从上方滑入/移动端从底部滑入）
2. Slideover 中调整筛选器 → DSL 实时更新 → 顶部搜索框同步
3. 点击"搜索" → Slideover 关闭 → 搜索结果刷新 → 在结果模式看到卡片列表
4. 再次点击"高级搜索" → Slideover 打开 → 筛选器状态从 DSL 回填
5. Slideover 中重置 → 筛选器清空
6. 关闭 Slideover（点击遮罩/关闭按钮）→ 回到结果模式，搜索不变
7. `/search/advanced` 返回 404

Run: `npx nuxt typecheck --dir apps/site-hearthstone`

---

## Self-Review

### 1. Spec coverage

| Spec 需求 | 对应 Task |
|-----------|-----------|
| 删除 `/search/advanced` 页面 | Task 3 |
| 不提取公共组件 | 设计决策：筛选器直接内联到 index.vue 的 Slideover body 中 |
| DSL 反填筛选器状态 | Task 1: `parseIntoState` |
| 筛选器实时同步到 DSL | Task 1: `useAdvancedSearch` 的 watch(dsl→searchInput) |
| 提交搜索 | Task 2: `commitAdvancedSearch` 关闭 Slideover + navigateTo |
| 桌面端上方滑入 / 移动端底部滑入 | Task 2: 响应式 `side` prop + `isMobile` 检测 |
| 结果与筛选器不同时显示 | 筛选器在 Slideover 中，Slideover 关闭显示结果 |
| 将来保留显示简略筛选标签 | 未实现（标记为未来可能） |

### 2. Placeholder scan

- 所有步骤有完整代码，无 TBD/TODO/FIXME
- 所有引用已有定义（NumericOperator, AdvancedSearchState 等来自 advanced-search.ts）

### 3. Type consistency

- `NumericOperator` 类型来自 `advanced-search.ts`，两个文件一致
- `toggleMulti` 签名与 advanced.vue 中一致
- UI 组件属性名称与 Nuxt UI v4 API 一致
