<template>
  <div class="advanced-search-page">
    <Teleport v-if="subheaderReady" to="#subheader-portal">
      <div class="controller h-12 flex items-center gap-3 px-4 shadow-md">
        <code class="flex-1 min-w-0 truncate font-mono text-xs text-white/70">
          {{ dsl || $t('hearthstone.search.advanced.emptyQuery') }}
        </code>

        <UButton
          icon="lucide:rotate-ccw"
          variant="ghost"
          size="sm"
          class="text-white/80 hover:text-white shrink-0"
          @click="reset"
        >
          {{ $t('hearthstone.search.advanced.reset') }}
        </UButton>

        <UButton
          icon="lucide:library"
          size="sm"
          variant="soft"
          class="shrink-0"
          :to="browseSetsUrl"
        >
          {{ $t('hearthstone.search.advanced.browseSets') }}
        </UButton>

        <UButton
          icon="lucide:search"
          size="sm"
          class="bg-white text-amber-700 hover:bg-white/90 shrink-0"
          :disabled="dsl === ''"
          :to="searchUrl"
        >
          {{ $t('hearthstone.search.advanced.search') }}
        </UButton>
      </div>
    </Teleport>

    <div class="mx-auto max-w-7xl mt-6 px-4 pb-12">
      <!-- Quick Actions -->
      <div class="mb-6 flex flex-wrap gap-3">
        <UButton
          icon="lucide:keyboard"
          variant="soft"
          to="/search"
          class="quick-action-btn"
        >
          {{ $t('hearthstone.search.advanced.plainSearch') }}
        </UButton>

        <UButton
          icon="lucide:library"
          variant="soft"
          :to="browseSetsUrl"
          class="quick-action-btn"
        >
          {{ $t('hearthstone.search.advanced.browseSets') }}
        </UButton>
      </div>

      <!-- Selected Filters Display -->
      <div v-if="hasSelectedFilters" class="selected-filters-panel mb-6">
        <div class="selected-filters-header">
          <UIcon name="lucide:filter" class="w-4 h-4" />
          <span>{{ $t('hearthstone.search.advanced.selectedFilters') }}</span>
          <button class="clear-btn" @click="reset">
            <UIcon name="lucide:x" class="w-4 h-4" />
            {{ $t('hearthstone.search.advanced.clearAll') }}
          </button>
        </div>
        <div class="selected-filters-list">
          <div v-for="(filter, index) in selectedFilters" :key="index" class="filter-tag">
            <span class="filter-label">{{ filter.label }}</span>
            <span class="filter-value">{{ filter.value }}</span>
          </div>
        </div>
      </div>

      <!-- Main Filter Grid -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Left Column -->
        <div class="flex flex-col gap-6">
          <!-- Text Section -->
          <section class="filter-panel">
            <div class="panel-header">
              <div class="panel-title">
                <UIcon name="lucide:text" class="w-5 h-5" />
                <span>{{ $t('hearthstone.search.advanced.sectionText') }}</span>
              </div>
              <div class="panel-divider"></div>
            </div>

            <div class="panel-content">
              <FieldRow :label="$t('hearthstone.search.advanced.keyword')" icon="lucide:search">
                <UInput
                  v-model="state.keyword"
                  size="sm"
                  class="w-full"
                  :placeholder="$t('hearthstone.search.advanced.keywordPlaceholder')"
                />
              </FieldRow>
            </div>
          </section>

          <!-- Identity Section -->
          <section class="filter-panel">
            <div class="panel-header">
              <div class="panel-title">
                <UIcon name="lucide:layers" class="w-5 h-5" />
                <span>{{ $t('hearthstone.search.advanced.sectionIdentity') }}</span>
              </div>
              <div class="panel-divider"></div>
            </div>

            <div class="panel-content space-y-6">
              <!-- Cost Section -->
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
                      @input="validateNumericInput"
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
                      @input="validateNumericInput"
                    />
                  </div>
                </div>
              </div>

              <!-- Class Section -->
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
                    :style="getClassIconStyle(item.value)"
                    @click="toggleMulti(state.classes, item.value)"
                  >
                    <span class="chip-icon" :style="getClassColorStyle(item.value)"></span>
                    <span class="chip-label-text">{{ item.label }}</span>
                  </button>
                </div>
              </div>

              <!-- Type Section -->
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

              <!-- Race Section -->
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

              <!-- Faction Section -->
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

              <!-- Spell School Section -->
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

              <!-- Rarity Section -->
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
          </section>
        </div>

        <!-- Right Column -->
        <div class="flex flex-col gap-6">
          <!-- Stats Section -->
          <section class="filter-panel">
            <div class="panel-header">
              <div class="panel-title">
                <UIcon name="lucide:bar-chart-2" class="w-5 h-5" />
                <span>{{ $t('hearthstone.search.advanced.sectionStats') }}</span>
              </div>
              <div class="panel-divider"></div>
            </div>

            <div class="panel-content space-y-6">
              <!-- Attack Section -->
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
                      @input="validateNumericInput"
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
                      @input="validateNumericInput"
                    />
                  </div>
                </div>
              </div>

              <!-- Health Section -->
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
                      @input="validateNumericInput"
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
                      @input="validateNumericInput"
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>

          <!-- Organization Section -->
          <section class="filter-panel">
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
          </section>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { NumericOperator } from '~/composables/advanced-search';

import { classes, format, race, rarity, spellSchool, types } from '#model/hearthstone/schema/basic';

import { useAdvancedSearch } from '~/composables/advanced-search';

definePageMeta({
  layout:    'main',
  titleType: 'input',
  actions:   [getHearthstoneActionMeta().random],
});

const { setActions } = useActions();
const actions = useHearthstoneActions();
const { t } = useI18n();
const { state, dsl, reset } = useAdvancedSearch();

setActions([actions.random]);
useTitle(() => t('hearthstone.search.advanced.$self'));

const subheaderReady = ref(false);

onMounted(() => {
  subheaderReady.value = true;
});

const searchUrl = computed(() => dsl.value === '' ? undefined : `/search?q=${encodeURIComponent(dsl.value)}`);
const browseSetsUrl = {
  path: '/sets',
};

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
const factionItems = computed(() => makeItems('hearthstone.search.parameter.faction', ['all', 'grimy_goons', 'jade_lotus', 'kabal', 'zerg', 'human', 'protoss']));
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

// Validate numeric input: only allow non-negative integers (0 and above)
const validateNumericInput = (event: Event) => {
  const input = event.target as HTMLInputElement;
  const value = input.value;
  
  // Remove any non-digit characters
  const cleaned = value.replace(/[^0-9]/g, '');
  
  // Update the value if it changed
  if (cleaned !== value) {
    input.value = cleaned;
    // Trigger v-model update
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
};

// Computed properties for selected filters display
const hasSelectedFilters = computed(() => {
  return state.value.classes.length > 0 ||
    state.value.types.length > 0 ||
    state.value.races.length > 0 ||
    state.value.factions.length > 0 ||
    state.value.spellSchools.length > 0 ||
    state.value.rarities.length > 0 ||
    state.value.costs.length > 0 ||
    state.value.attacks.length > 0 ||
    state.value.healths.length > 0 ||
    state.value.cost[0].value !== '' ||
    state.value.cost[1].value !== '' ||
    state.value.attack[0].value !== '' ||
    state.value.attack[1].value !== '' ||
    state.value.health[0].value !== '' ||
    state.value.health[1].value !== '' ||
    state.value.format !== '' ||
    state.value.keyword.trim() !== '';
});

const selectedFilters = computed(() => {
  const filters: Array<{ label: string; value: string }> = [];

  if (state.value.keyword.trim()) {
    filters.push({ label: t('hearthstone.search.advanced.keyword'), value: state.value.keyword });
  }

  state.value.classes.forEach(v => filters.push({ label: t('hearthstone.search.command.class'), value: t(`hearthstone.class.${v}`) }));
  state.value.types.forEach(v => filters.push({ label: t('hearthstone.search.command.type'), value: t(`hearthstone.card.type.${v}`) }));
  state.value.races.forEach(v => filters.push({ label: t('hearthstone.search.command.race'), value: t(`hearthstone.card.race.${v}`) }));
  state.value.factions.forEach(v => filters.push({ label: t('hearthstone.search.command.faction'), value: t(`hearthstone.search.parameter.faction.${v}`) }));
  state.value.spellSchools.forEach(v => filters.push({ label: t('hearthstone.search.command.spell-school'), value: t(`hearthstone.card.spellSchool.${v}`) }));
  state.value.rarities.forEach(v => filters.push({ label: t('hearthstone.search.command.rarity'), value: t(`hearthstone.search.parameter.rarity.${v}`) }));
  state.value.costs.forEach(v => filters.push({ label: t('hearthstone.search.command.cost'), value: v }));
  state.value.attacks.forEach(v => filters.push({ label: t('hearthstone.search.command.attack'), value: v }));
  state.value.healths.forEach(v => filters.push({ label: t('hearthstone.search.command.health'), value: v }));

  if (state.value.cost[0].value) filters.push({ label: t('hearthstone.search.command.cost'), value: `${state.value.cost[0].operator}${state.value.cost[0].value}` });
  if (state.value.cost[1].value) filters.push({ label: t('hearthstone.search.command.cost'), value: `${state.value.cost[1].operator}${state.value.cost[1].value}` });
  if (state.value.attack[0].value) filters.push({ label: t('hearthstone.search.command.attack'), value: `${state.value.attack[0].operator}${state.value.attack[0].value}` });
  if (state.value.attack[1].value) filters.push({ label: t('hearthstone.search.command.attack'), value: `${state.value.attack[1].operator}${state.value.attack[1].value}` });
  if (state.value.health[0].value) filters.push({ label: t('hearthstone.search.command.health'), value: `${state.value.health[0].operator}${state.value.health[0].value}` });
  if (state.value.health[1].value) filters.push({ label: t('hearthstone.search.command.health'), value: `${state.value.health[1].operator}${state.value.health[1].value}` });

  if (state.value.format) filters.push({ label: t('hearthstone.search.command.format'), value: t(`hearthstone.format.${state.value.format}`) });

  return filters;
});

// Class color mapping
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

const getClassIconStyle = (className: string) => {
  return {};
};
</script>

<style lang="scss" scoped>
.advanced-search-page {
  background: linear-gradient(135deg, #0a0e1a 0%, #1a1f2e 100%);
  min-height: 100vh;
}

.controller {
  background: linear-gradient(90deg, rgba(217, 119, 6, 0.95) 0%, rgba(180, 100, 5, 0.95) 100%);
  backdrop-filter: blur(12px);
  border-bottom: 2px solid rgba(255, 200, 100, 0.3);
}

.quick-action-btn {
  @apply bg-white/10 hover:bg-white/20 text-white/90 border border-white/20;
}

// Selected Filters Panel
.selected-filters-panel {
  background: rgba(20, 30, 50, 0.85);
  border: 1px solid rgba(100, 150, 255, 0.2);
  border-radius: 12px;
  padding: 16px;
  backdrop-filter: blur(8px);
}

.selected-filters-header {
  @apply flex items-center gap-2 mb-3 text-sm font-semibold text-blue-300;

  .clear-btn {
    @apply ml-auto text-xs text-red-400 hover:text-red-300 cursor-pointer flex items-center gap-1 transition-colors;
    background: none;
    border: none;
    padding: 4px 8px;
    border-radius: 6px;

    &:hover {
      background: rgba(255, 100, 100, 0.1);
    }
  }
}

.selected-filters-list {
  @apply flex flex-wrap gap-2;
}

.filter-tag {
  @apply inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs;
  background: rgba(50, 70, 100, 0.6);
  border: 1px solid rgba(100, 150, 255, 0.3);
  color: #e0e8ff;
}

.filter-label {
  @apply text-blue-300/70;
}

.filter-value {
  @apply font-medium;
}

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

// Filter Group
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

// Chip Button - Tag style buttons
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

// Cost Buttons
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

// Numeric Inputs
.numeric-inputs {
  @apply flex flex-col gap-2;
}

.numeric-row {
  @apply flex gap-2 items-center;
}

// Responsive adjustments
@media (max-width: 1024px) {
  .advanced-search-page {
    padding-bottom: 24px;
  }
}
</style>
