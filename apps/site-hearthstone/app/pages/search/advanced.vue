<template>
  <div>
    <Teleport to="#subheader-portal">
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

    <UCard class="mx-auto max-w-7xl mt-0">
      <div class="mb-5 flex flex-wrap gap-3">
        <UButton
          icon="lucide:keyboard"
          variant="soft"
          to="/search"
        >
          {{ $t('hearthstone.search.advanced.plainSearch') }}
        </UButton>

        <UButton
          icon="lucide:library"
          variant="soft"
          :to="browseSetsUrl"
        >
          {{ $t('hearthstone.search.advanced.browseSets') }}
        </UButton>
      </div>

      <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div class="flex flex-col gap-6">
          <section>
            <div class="section-title">{{ $t('hearthstone.search.advanced.sectionText') }}</div>

            <div class="grid grid-cols-1 gap-3">
              <FieldRow :label="$t('hearthstone.search.advanced.keyword')">
                <UInput
                  v-model="state.keyword"
                  size="sm"
                  class="w-full"
                  :placeholder="$t('hearthstone.search.advanced.keywordPlaceholder')"
                />
              </FieldRow>
            </div>
          </section>

          <section>
            <div class="section-title">{{ $t('hearthstone.search.advanced.sectionIdentity') }}</div>

            <div class="space-y-4">
              <div>
                <div class="chip-label">{{ $t('hearthstone.search.command.class') }}</div>
                <div class="chip-group">
                  <UButton
                    v-for="item in classItems"
                    :key="item.value"
                    size="sm"
                    :variant="state.classes.includes(item.value) ? 'solid' : 'outline'"
                    :color="state.classes.includes(item.value) ? 'primary' : 'neutral'"
                    @click="toggleMulti(state.classes, item.value)"
                  >
                    {{ item.label }}
                  </UButton>
                </div>
              </div>

              <div>
                <div class="chip-label">{{ $t('hearthstone.search.command.type') }}</div>
                <div class="chip-group">
                  <UButton
                    v-for="item in typeItems"
                    :key="item.value"
                    size="sm"
                    :variant="state.types.includes(item.value) ? 'solid' : 'outline'"
                    :color="state.types.includes(item.value) ? 'primary' : 'neutral'"
                    @click="toggleMulti(state.types, item.value)"
                  >
                    {{ item.label }}
                  </UButton>
                </div>
              </div>

              <div>
                <div class="chip-label">{{ $t('hearthstone.search.command.race') }}</div>
                <div class="chip-group">
                  <UButton
                    v-for="item in raceItems"
                    :key="item.value"
                    size="sm"
                    :variant="state.races.includes(item.value) ? 'solid' : 'outline'"
                    :color="state.races.includes(item.value) ? 'primary' : 'neutral'"
                    @click="toggleMulti(state.races, item.value)"
                  >
                    {{ item.label }}
                  </UButton>
                </div>
              </div>

              <div>
                <div class="chip-label">{{ $t('hearthstone.search.command.spell-school') }}</div>
                <div class="chip-group">
                  <UButton
                    v-for="item in spellSchoolItems"
                    :key="item.value"
                    size="sm"
                    :variant="state.spellSchools.includes(item.value) ? 'solid' : 'outline'"
                    :color="state.spellSchools.includes(item.value) ? 'primary' : 'neutral'"
                    @click="toggleMulti(state.spellSchools, item.value)"
                  >
                    {{ item.label }}
                  </UButton>
                </div>
              </div>

              <div>
                <div class="chip-label">{{ $t('hearthstone.search.command.rarity') }}</div>
                <div class="chip-group">
                  <UButton
                    v-for="item in rarityItems"
                    :key="item.value"
                    size="sm"
                    :variant="state.rarities.includes(item.value) ? 'solid' : 'outline'"
                    :color="state.rarities.includes(item.value) ? 'primary' : 'neutral'"
                    @click="toggleMulti(state.rarities, item.value)"
                  >
                    {{ item.label }}
                  </UButton>
                </div>
              </div>
            </div>
          </section>
        </div>

        <div class="flex flex-col gap-6">
          <section>
            <div class="space-y-6">
              <div>
                <div class="chip-label">{{ $t('hearthstone.search.command.cost') }}</div>
                <div class="chip-group mb-2">
                  <UButton
                    v-for="item in costItems"
                    :key="item.value"
                    size="sm"
                    :variant="state.costs.includes(item.value) ? 'solid' : 'outline'"
                    :color="state.costs.includes(item.value) ? 'primary' : 'neutral'"
                    @click="toggleMulti(state.costs, item.value)"
                  >
                    {{ item.label }}
                  </UButton>
                </div>
                <div class="flex flex-col gap-2">
                  <div class="flex gap-2">
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
                    />
                  </div>
                  <div class="flex gap-2">
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
                    />
                  </div>
                </div>
              </div>

              <div>
                <div class="chip-label">{{ $t('hearthstone.search.command.attack') }}</div>
                <div class="chip-group mb-2">
                  <UButton
                    v-for="item in costItems"
                    :key="item.value"
                    size="sm"
                    :variant="state.attacks.includes(item.value) ? 'solid' : 'outline'"
                    :color="state.attacks.includes(item.value) ? 'primary' : 'neutral'"
                    @click="toggleMulti(state.attacks, item.value)"
                  >
                    {{ item.label }}
                  </UButton>
                </div>
                <div class="flex flex-col gap-2">
                  <div class="flex gap-2">
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
                    />
                  </div>
                  <div class="flex gap-2">
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
                    />
                  </div>
                </div>
              </div>

              <div>
                <div class="chip-label">{{ $t('hearthstone.search.command.health') }}</div>
                <div class="chip-group mb-2">
                  <UButton
                    v-for="item in costItems"
                    :key="item.value"
                    size="sm"
                    :variant="state.healths.includes(item.value) ? 'solid' : 'outline'"
                    :color="state.healths.includes(item.value) ? 'primary' : 'neutral'"
                    @click="toggleMulti(state.healths, item.value)"
                  >
                    {{ item.label }}
                  </UButton>
                </div>
                <div class="flex flex-col gap-2">
                  <div class="flex gap-2">
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
                    />
                  </div>
                  <div class="flex gap-2">
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
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section>
            <div class="section-title">{{ $t('hearthstone.search.advanced.sectionOrganization') }}</div>

            <div class="grid grid-cols-1 gap-3">
              <FieldRow :label="$t('hearthstone.search.command.format')">
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
    </UCard>
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

const searchUrl = computed(() => dsl.value === '' ? undefined : `/search?q=${encodeURIComponent(dsl.value)}`);
const browseSetsUrl = {
  path:  '/search',
  query: { q: 'order:set+,name+' },
};

const costItems = computed(() => ([
  ...Array.from({ length: 10 }, (_, index) => {
    const value = String(index);
    return { value, label: value };
  }),
  { value: '10+', label: '10+' },
]));

const numericOperators = [
  { value: '=' as NumericOperator, label: '=' },
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
const formatItems = computed(() => makeItems('hearthstone.format', ['standard', 'wild', 'twist', 'classic']));
const typeItems = computed(() => makeItems('hearthstone.card.type', ['minion', 'spell', 'weapon', 'hero', 'location']));
const raceItems = computed(() => makeItems('hearthstone.card.race', ['dragon', 'demon', 'beast', 'murloc', 'pirate', 'mech', 'elemental', 'naga', 'quilboar', 'totem', 'undead', 'draenei', 'all']));
const spellSchoolItems = computed(() => makeItems('hearthstone.card.spellSchool', spellSchool.options));
const rarityItems = computed(() => makeItems('hearthstone.search.parameter.rarity', ['free', 'common', 'rare', 'epic', 'legendary']));
const orderItems = computed(() => makeItems('hearthstone.search.parameter.order', ['name', 'cost', 'attack', 'health', 'set', 'id']));

const directions = computed(() => [
  { value: '' as const, label: t('hearthstone.search.advanced.directionDefault') },
  { value: '+' as const, label: t('hearthstone.search.advanced.directionAsc') },
  { value: '-' as const, label: t('hearthstone.search.advanced.directionDesc') },
]);

const toggleMulti = (values: string[], value: string) => {
  const index = values.indexOf(value);

  if (index >= 0) {
    values.splice(index, 1);
  } else {
    values.push(value);
  }
};

const setSingle = (values: string[], value?: string) => {
  values.splice(0, values.length);

  if (value != null && value !== '') {
    values.push(value);
  }
};
</script>

<style lang="scss" scoped>
.controller {
  background-color: rgba(217, 119, 6, 0.88);
  backdrop-filter: blur(8px);
}

.section-title {
  @apply mb-3 border-b border-gray-200 pb-1.5 text-sm font-semibold text-gray-700 dark:border-white/10 dark:text-white/80;
}

.chip-label {
  @apply mb-2 text-xs text-gray-500 dark:text-white/50;
}

.chip-group {
  @apply flex flex-wrap gap-2;
}
</style>
