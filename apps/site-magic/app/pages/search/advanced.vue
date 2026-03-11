<template>
  <div>
    <!-- ── Subheader: Live Query Bar ───────────────────────────────────────── -->
    <Teleport to="#subheader-portal" defer>
      <div class="controller h-12 flex items-center gap-3 px-4 shadow-md">
        <!-- Current DSL preview -->
        <code class="flex-1 text-xs text-white/60 truncate font-mono min-w-0">
          {{ dsl || $t('magic.search.advanced.empty-query') }}
        </code>

        <!-- Reset -->
        <UButton
          icon="lucide:rotate-ccw"
          variant="ghost"
          size="sm"
          class="text-white/70 hover:text-white shrink-0"
          @click="reset"
        >
          {{ $t('magic.search.advanced.reset') }}
        </UButton>

        <!-- Search -->
        <UButton
          icon="lucide:search"
          size="sm"
          class="bg-white text-indigo-600 hover:bg-white/90 shrink-0"
          :to="searchUrl"
        >
          {{ $t('magic.search.advanced.search') }}
        </UButton>
      </div>
    </Teleport>

    <!-- ── Main form ─────────────────────────────────────────────────────────── -->
    <UCard class="max-w-8xl mx-auto mt-0">
      <!-- ── Cannot-parse warning ───────────────────────────────────────────── -->
      <div
        v-if="cannotParse"
        class="mb-4 p-3 rounded-lg bg-yellow-100 dark:bg-yellow-500/20 border border-yellow-300 dark:border-yellow-400/40 flex items-center gap-2 text-yellow-700 dark:text-yellow-200 text-sm"
      >
        <UIcon name="lucide:alert-triangle" class="shrink-0" />
        <span>{{ $t('magic.search.advanced.cannot-parse') }}</span>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- ── Left column ──────────────────────────────────────────────────── -->
        <div class="flex flex-col gap-6">
          <!-- § Text Search -->
          <section>
            <div class="section-title">{{ $t('magic.search.advanced.section-text') }}</div>
            <div class="grid grid-cols-1 gap-2">
              <FieldRow :label="$t('magic.search.command.name')">
                <TextSearch v-model="state.name" with-modifier />
              </FieldRow>
              <FieldRow :label="$t('magic.search.command.type')">
                <TextSearch v-model="state.type" with-modifier />
              </FieldRow>
              <FieldRow :label="$t('magic.search.command.text')">
                <TextSearch v-model="state.text" with-modifier />
              </FieldRow>
              <FieldRow :label="$t('magic.search.command.oracle')">
                <TextSearch v-model="state.oracle" />
              </FieldRow>
              <FieldRow :label="$t('magic.search.command.flavor-text')">
                <TextSearch v-model="state.flavorText" />
              </FieldRow>
              <FieldRow :label="$t('magic.search.command.flavor-name')">
                <TextSearch v-model="state.flavorName" />
              </FieldRow>
            </div>
          </section>

          <!-- § Colors -->
          <section>
            <div class="section-title">{{ $t('magic.search.advanced.section-color') }}</div>
            <div class="grid grid-cols-1 gap-3">
              <FieldRow :label="$t('magic.search.command.color')">
                <ColorPicker v-model="state.color" />
              </FieldRow>
              <FieldRow :label="$t('magic.search.command.color-identity')">
                <ColorPicker v-model="state.colorIdentity" />
              </FieldRow>
              <FieldRow :label="$t('magic.search.command.color-indicator')">
                <ColorPicker v-model="state.colorIndicator" />
              </FieldRow>
            </div>
          </section>

          <!-- § Mana -->
          <section>
            <div class="section-title">{{ $t('magic.search.advanced.section-mana') }}</div>
            <div class="grid grid-cols-1 gap-3">
              <FieldRow :label="$t('magic.search.command.cost')">
                <ManaCostInput v-model="state.manaCost" />
              </FieldRow>
              <FieldRow :label="$t('magic.search.command.mana-value')">
                <NumericInput v-model="state.manaValue" />
              </FieldRow>
            </div>
          </section>

          <!-- § Keywords & Counters -->
          <section>
            <div class="section-title">{{ $t('magic.search.advanced.section-tags') }}</div>
            <div class="grid grid-cols-1 gap-3">
              <FieldRow :label="$t('magic.search.command.keyword')">
                <TagInput v-model="state.keyword" :placeholder="$t('magic.search.advanced.keyword-placeholder')" />
              </FieldRow>
              <FieldRow :label="$t('magic.search.command.counter')">
                <TagInput v-model="state.counter" :placeholder="$t('magic.search.advanced.counter-placeholder')" />
              </FieldRow>
            </div>
          </section>
        </div>

        <!-- ── Right column ─────────────────────────────────────────────────── -->
        <div class="flex flex-col gap-6">
          <!-- § Combat Attributes -->
          <section>
            <div class="section-title">{{ $t('magic.search.advanced.section-combat') }}</div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <FieldRow :label="$t('magic.search.command.power')">
                <NumericInput v-model="state.power" />
              </FieldRow>
              <FieldRow :label="$t('magic.search.command.toughness')">
                <NumericInput v-model="state.toughness" />
              </FieldRow>
              <FieldRow :label="$t('magic.search.command.loyalty')">
                <NumericInput v-model="state.loyalty" />
              </FieldRow>
              <FieldRow :label="$t('magic.search.command.defense')">
                <NumericInput v-model="state.defense" />
              </FieldRow>
            </div>
          </section>

          <!-- § Card Face -->
          <section>
            <div class="section-title">{{ $t('magic.search.advanced.section-card') }}</div>

            <!-- Rarity -->
            <div class="mb-3">
              <div class="flex items-center gap-2 mb-1.5">
                <span class="text-xs text-gray-500 dark:text-white/50">{{ $t('magic.search.command.rarity') }}</span>
                <button
                  v-if="state.rarity.length > 0"
                  class="text-xs text-gray-400 hover:text-gray-600 dark:text-white/40 dark:hover:text-white/80 transition"
                  @click="state.rarity.splice(0)"
                >×</button>
              </div>
              <div class="flex flex-wrap gap-2">
                <UButton
                  v-for="r in RARITIES"
                  :key="r.value"
                  size="sm"
                  :variant="state.rarity.includes(r.value) ? 'solid' : 'outline'"
                  :color="state.rarity.includes(r.value) ? 'primary' : 'neutral'"
                  :class="state.rarity.includes(r.value) ? '' : 'opacity-60 hover:opacity-100'"
                  @click="toggleMulti(state.rarity, r.value)"
                >
                  {{ r.label }}
                </UButton>
              </div>
            </div>

            <!-- Layout -->
            <div class="mb-3">
              <div class="flex items-center gap-2 mb-1.5">
                <span class="text-xs text-gray-500 dark:text-white/50">{{ $t('magic.search.command.layout') }}</span>
                <button
                  v-if="state.layout.length > 0"
                  class="text-xs text-gray-400 hover:text-gray-600 dark:text-white/40 dark:hover:text-white/80 transition"
                  @click="state.layout.splice(0)"
                >×</button>
              </div>
              <div class="flex flex-wrap gap-2">
                <UButton
                  v-for="l in LAYOUTS"
                  :key="l.value"
                  size="sm"
                  :variant="state.layout.includes(l.value) ? 'solid' : 'outline'"
                  :color="state.layout.includes(l.value) ? 'primary' : 'neutral'"
                  :class="state.layout.includes(l.value) ? '' : 'opacity-60 hover:opacity-100'"
                  @click="toggleMulti(state.layout, l.value)"
                >
                  {{ l.label }}
                </UButton>
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <FieldRow :label="$t('magic.search.command.set')">
                <TextSearch v-model="state.set" />
              </FieldRow>
              <FieldRow :label="$t('magic.search.command.number')">
                <TextSearch v-model="state.number" />
              </FieldRow>
              <FieldRow :label="$t('magic.search.command.lang')">
                <div class="flex items-center gap-2">
                  <USelect
                    :model-value="state.lang || undefined"
                    :items="LANG_ITEMS"
                    size="sm"
                    class="flex-1"
                    :placeholder="$t('magic.search.advanced.any')"
                    @update:model-value="v => state.lang = (v as string) ?? ''"
                  />
                  <UButton
                    v-if="state.lang"
                    icon="lucide:x"
                    variant="ghost"
                    size="sm"
                    color="neutral"
                    class="opacity-50 hover:opacity-100"
                    @click="state.lang = ''"
                  />
                </div>
              </FieldRow>
            </div>
          </section>

          <!-- § Date & Format -->
          <section>
            <div class="section-title">{{ $t('magic.search.advanced.section-date-format') }}</div>

            <FieldRow :label="$t('magic.search.command.release-date')" class="mb-3">
              <div class="flex items-center gap-2">
                <USelect
                  :model-value="state.date.operator"
                  :items="NUMERIC_OPS"
                  size="sm"
                  class="w-20"
                  :ui="{ base: 'font-mono' }"
                  @update:model-value="v => state.date.operator = v as any"
                />
                <UInput
                  v-model="state.date.value"
                  size="sm"
                  placeholder="2024-01-01"
                  class="w-36"
                  :ui="{ base: 'font-mono' }"
                />
                <UButton
                  :color="state.date.negate ? 'error' : 'neutral'"
                  :variant="state.date.negate ? 'solid' : 'ghost'"
                  size="sm"
                  :class="state.date.negate ? '' : 'opacity-50'"
                  @click="state.date.negate = !state.date.negate"
                >
                  {{ $t('magic.search.advanced.negate') }}
                </UButton>
                <UButton
                  v-if="state.date.value !== '' || state.date.negate"
                  icon="lucide:x"
                  variant="ghost"
                  size="sm"
                  color="neutral"
                  class="opacity-50 hover:opacity-100"
                  @click="state.date = { value: '', operator: '=', negate: false }"
                />
              </div>
            </FieldRow>

            <FieldRow :label="$t('magic.search.command.format')">
              <div class="flex flex-wrap items-center gap-2">
                <USelect
                  :model-value="state.format.format || undefined"
                  :items="FORMAT_ITEMS"
                  size="sm"
                  class="w-44"
                  :placeholder="$t('magic.search.advanced.any')"
                  @update:model-value="v => state.format.format = (v as string) ?? ''"
                />
                <USelect
                  :model-value="state.format.status || undefined"
                  :items="LEGALITY_ITEMS"
                  size="sm"
                  class="w-28"
                  :placeholder="$t('magic.search.advanced.any')"
                  @update:model-value="v => state.format.status = (v as string) ?? ''"
                />
                <UButton
                  :color="state.format.negate ? 'error' : 'neutral'"
                  :variant="state.format.negate ? 'solid' : 'ghost'"
                  size="sm"
                  :class="state.format.negate ? '' : 'opacity-50'"
                  @click="state.format.negate = !state.format.negate"
                >
                  {{ $t('magic.search.advanced.negate') }}
                </UButton>
                <UButton
                  v-if="state.format.format || state.format.status || state.format.negate"
                  icon="lucide:x"
                  variant="ghost"
                  size="sm"
                  color="neutral"
                  class="opacity-50 hover:opacity-100"
                  @click="state.format = { format: '', status: '', negate: false }"
                />
              </div>
            </FieldRow>
          </section>

          <!-- § Sort -->
          <section>
            <div class="section-title">{{ $t('magic.search.advanced.section-sort') }}</div>
            <div class="flex flex-wrap items-center gap-3">
              <USelect
                :model-value="state.order.value || undefined"
                :items="ORDER_ITEMS"
                size="sm"
                class="w-40"
                :placeholder="$t('magic.search.advanced.any')"
                @update:model-value="v => state.order.value = (v as string) ?? ''"
              />
              <div class="flex rounded overflow-hidden ring-1 ring-gray-300 dark:ring-white/20">
                <button
                  v-for="dir in DIRECTIONS"
                  :key="dir.value"
                  class="px-3 py-1.5 text-sm transition"
                  :class="state.order.direction === dir.value
                    ? 'bg-gray-200 dark:bg-white/30 text-gray-900 dark:text-white'
                    : 'bg-gray-50 dark:bg-white/5 text-gray-500 dark:text-white/50 hover:bg-gray-100 dark:hover:bg-white/15'"
                  @click="state.order.direction = dir.value"
                >
                  {{ dir.label }}
                </button>
              </div>
              <UButton
                v-if="state.order.value || state.order.direction !== ''"
                icon="lucide:x"
                variant="ghost"
                size="sm"
                color="neutral"
                class="opacity-50 hover:opacity-100"
                @click="state.order = { value: '', direction: '' }"
              />
            </div>
          </section>
        </div>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import { useAdvancedSearch } from '~/composables/advanced-search';

// ── Page meta ─────────────────────────────────────────────────────────────────

definePageMeta({
  layout:    'main',
  game:      'magic',
  titleType: 'input',
});

const { t } = useI18n();

// ── Composable ────────────────────────────────────────────────────────────────

const { state, dsl, cannotParse, reset } = useAdvancedSearch();

const searchUrl = computed(() =>
  dsl.value ? `/search?q=${encodeURIComponent(dsl.value)}` : undefined,
);

// ── Static option lists ───────────────────────────────────────────────────────

/** Build a `{ value, label }` list by mapping each value to `t(\`${prefix}.${value}\`)` */
const makeItems = (prefix: string, values: readonly string[]) =>
  computed(() => values.map(v => ({ value: v, label: t(`${prefix}.${v}`) })));

const RARITIES = makeItems('magic.rarity', ['common', 'uncommon', 'rare', 'mythic']);

const LAYOUTS = makeItems('magic.search.parameter.layout', [
  'transform', 'modal_dfc', 'battle', 'adventure', 'saga',
  'split', 'flip', 'meld', 'prototype', 'class', 'leveler',
]);

const LANG_ITEMS = makeItems('lang', ['en', 'de', 'es', 'fr', 'it', 'ja', 'ko', 'pt', 'ru', 'zhs', 'zht']);

const FORMAT_ITEMS = makeItems('magic.format', [
  'standard', 'pioneer', 'modern', 'legacy', 'vintage', 'commander',
  'pauper', 'alchemy', 'historic', 'explorer', 'timeless', 'brawl', 'oathbreaker',
]);

const LEGALITY_ITEMS = makeItems('magic.legality', ['legal', 'restricted', 'banned']);

const ORDER_ITEMS = makeItems('magic.search.parameter.order', ['name', 'date', 'id', 'cost']);

const NUMERIC_OPS = [
  { value: '=', label: '=' },
  { value: '>', label: '>' },
  { value: '>=', label: '>=' },
  { value: '<', label: '<' },
  { value: '<=', label: '<=' },
];

const DIRECTIONS = computed(() => [
  { value: '' as const, label: t('magic.search.advanced.direction-default') },
  { value: '+' as const, label: t('magic.search.advanced.direction-asc') },
  { value: '-' as const, label: t('magic.search.advanced.direction-desc') },
]);

// ── Helpers ───────────────────────────────────────────────────────────────────

const toggleMulti = (arr: string[], value: string) => {
  const idx = arr.indexOf(value);
  if (idx >= 0) {
    arr.splice(idx, 1);
  } else {
    arr.push(value);
  }
};
</script>

<style lang="scss" scoped>
.controller {
  background-color: rgba(79, 70, 229, 0.85);
  backdrop-filter: blur(8px);
}

.section-title {
  @apply text-sm font-semibold text-gray-700 dark:text-white/80 mb-3 pb-1.5 border-b border-gray-200 dark:border-white/10;
}
</style>
