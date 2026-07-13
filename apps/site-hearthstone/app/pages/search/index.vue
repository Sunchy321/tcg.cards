<template>
  <div>
    <Teleport v-if="subheaderReady" to="#subheader-portal">
      <div class="h-12 flex items-center gap-3 px-4 shadow-md bg-amber-700/90 backdrop-blur-sm">
        <UIcon
          v-show="searching"
          name="lucide:refresh-cw"
          class="animate-spin text-white/80 shrink-0"
        />

        <span class="text-sm text-white/90 truncate">
          {{ explainText }}
        </span>

        <div class="flex-1" />

        <UButton
          icon="lucide:sliders-horizontal"
          variant="outline"
          size="sm"
          color="primary"
          class="text-white! ring-white!"
          @click="openAdvanced"
        >
          {{ $t('hearthstone.search.advanced.$self') }}
        </UButton>

        <UButton
          :icon="layoutIcon"
          variant="outline"
          size="sm"
          color="primary"
          class="text-white! ring-white!"
          @click="cycleLayout"
        >
          {{ layoutLabel }}
        </UButton>

        <span v-if="data != null" class="font-mono text-sm text-white/70 shrink-0">
          {{ total }}
        </span>

        <span v-if="elapsed > 0" class="font-mono text-xs text-white/50 shrink-0">
          {{ formatElapsed(elapsed) }}
        </span>

        <UPagination
          v-if="pageCount > 1"
          :page="page"
          :total="total"
          :items-per-page="pageSize"
          size="sm"
          @update:page="changePage"
        />
      </div>
    </Teleport>

    <Transition name="filter-panel">
      <div
        v-if="isAdvancedOpen"
        class="filter-panel-container pb-6"
      >
        <div class="sticky top-0 z-10 flex items-center gap-2 min-h-12 px-4 mb-4 border-b border-[rgba(180,130,50,0.2)] bg-[rgba(35,18,6,0.97)]">
          <code class="flex-1 min-w-0 truncate font-mono text-xs text-amber-200/70">
            {{ dslExplained || $t('hearthstone.search.advanced.emptyQuery') }}
          </code>
          <div class="flex items-center gap-2">
            <UButton
              icon="lucide:rotate-ccw"
              variant="outline"
              color="primary"
              size="sm"
              class="text-white! ring-white!"
              @click="reset"
            >
              {{ $t('hearthstone.search.advanced.reset') }}
            </UButton>
            <UButton
              icon="lucide:search"
              size="sm"
              color="primary"
              variant="solid"
              :disabled="dsl === ''"
              @click="commitAdvancedSearch"
            >
              {{ $t('hearthstone.search.advanced.search') }}
            </UButton>
            <UButton
              icon="lucide:x"
              variant="ghost"
              size="sm"
              @click="closeAdvanced"
            />
          </div>
        </div>

        <div class="px-4 max-w-5xl mx-auto xl:max-w-none xl:mx-0">
          <div class="columns-1 gap-x-4 lg:columns-2 xl:columns-3">

              <!-- Text Section -->
              <div class="rounded-2xl overflow-hidden backdrop-blur-sm shadow-[0_4px_16px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.05)] border border-[rgba(180,120,50,0.25)] bg-[rgba(50,28,8,0.75)] break-inside-avoid mb-4">
                <div class="px-5 pt-4">
                  <div class="flex items-center gap-2 text-base font-semibold text-amber-200 mb-3 [&_svg]:drop-shadow-[0_0_8px_rgba(255,160,50,0.4)]">
                    <UIcon name="lucide:text" class="w-5 h-5" />
                    <span>{{ $t('hearthstone.search.advanced.sectionText') }}</span>
                  </div>
                  <div class="panel-divider"/>
                </div>

                <div class="px-5 pb-5">
                  <FieldRow :label="$t('hearthstone.search.advanced.keyword')" icon="lucide:search">
                    <UInput
                      v-model="state.keyword"
                      size="sm"
                      class="w-full"
                      :placeholder="$t('hearthstone.search.advanced.keywordPlaceholder')"
                    />
                  </FieldRow>
                </div>
              </div>

              <!-- Cost -->
              <div class="rounded-2xl overflow-hidden backdrop-blur-sm shadow-[0_4px_16px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.05)] border border-[rgba(180,120,50,0.25)] bg-[rgba(50,28,8,0.75)] break-inside-avoid mb-4">
                <div class="px-5 pt-4">
                  <div class="flex items-center gap-2 text-sm font-medium text-amber-300/80 mb-2 [&_svg]:size-4">
                    <UIcon name="i:hearthstone-cost" class="w-5 h-5" />
                    <span>{{ $t('hearthstone.search.command.cost') }}</span>
                  </div>
                  <div class="panel-divider"/>
                </div>
                <div class="px-5 pb-5">
                  <div class="flex flex-nowrap gap-1 mb-3">
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
                  <div class="flex flex-col gap-2">
                    <div class="flex gap-2 items-center">
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
                    <div class="flex gap-2 items-center">
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
              </div>

              <!-- Class -->
              <div class="rounded-2xl overflow-hidden backdrop-blur-sm shadow-[0_4px_16px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.05)] border border-[rgba(180,120,50,0.25)] bg-[rgba(50,28,8,0.75)] break-inside-avoid mb-4">
                <div class="px-5 pt-4">
                  <div class="flex items-center gap-2 text-sm font-medium text-amber-300/80 mb-2 [&_svg]:size-4">
                    <UIcon name="i:hearthstone-class-neutral" class="w-5 h-5" />
                    <span>{{ $t('hearthstone.search.command.class') }}</span>
                  </div>
                  <div class="panel-divider"/>
                </div>
                <div class="px-5 pb-5">
                  <div class="flex flex-wrap gap-2">
                    <button
                      v-for="item in classItems"
                      :key="item.value"
                      class="chip-btn"
                      :class="{ active: state.classes.includes(item.value) }"
                      @click="toggleMulti(state.classes, item.value)"
                    >
                      <span class="chip-icon" :style="getClassColorStyle(item.value)"/>
                      <span class="whitespace-nowrap">{{ item.label }}</span>
                    </button>
                  </div>
                </div>
              </div>

              <!-- Type -->
              <div class="rounded-2xl overflow-hidden backdrop-blur-sm shadow-[0_4px_16px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.05)] border border-[rgba(180,120,50,0.25)] bg-[rgba(50,28,8,0.75)] break-inside-avoid mb-4">
                <div class="px-5 pt-4">
                  <div class="flex items-center gap-2 text-sm font-medium text-amber-300/80 mb-2 [&_svg]:size-4">
                    <UIcon name="lucide:tag" class="w-5 h-5" />
                    <span>{{ $t('hearthstone.search.command.type') }}</span>
                  </div>
                  <div class="panel-divider"/>
                </div>
                <div class="px-5 pb-5">
                  <div class="flex flex-wrap gap-2">
                    <button
                      v-for="item in typeItems"
                      :key="item.value"
                      class="chip-btn"
                      :class="{ active: state.types.includes(item.value) }"
                      @click="toggleMulti(state.types, item.value)"
                    >
                      <span class="whitespace-nowrap">{{ item.label }}</span>
                    </button>
                  </div>
                </div>
              </div>

              <!-- Race -->
              <div class="rounded-2xl overflow-hidden backdrop-blur-sm shadow-[0_4px_16px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.05)] border border-[rgba(180,120,50,0.25)] bg-[rgba(50,28,8,0.75)] break-inside-avoid mb-4">
                <div class="px-5 pt-4">
                  <div class="flex items-center gap-2 text-sm font-medium text-amber-300/80 mb-2 [&_svg]:size-4">
                    <UIcon name="lucide:paw-print" class="w-5 h-5" />
                    <span>{{ $t('hearthstone.search.command.race') }}</span>
                  </div>
                  <div class="panel-divider"/>
                </div>
                <div class="px-5 pb-5">
                  <div class="flex flex-wrap gap-2">
                    <button
                      v-for="item in raceItems"
                      :key="item.value"
                      class="chip-btn"
                      :class="{ active: state.races.includes(item.value) }"
                      @click="toggleMulti(state.races, item.value)"
                    >
                      <span class="whitespace-nowrap">{{ item.label }}</span>
                    </button>
                  </div>
                </div>
              </div>

              <!-- Faction -->
              <div class="rounded-2xl overflow-hidden backdrop-blur-sm shadow-[0_4px_16px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.05)] border border-[rgba(180,120,50,0.25)] bg-[rgba(50,28,8,0.75)] break-inside-avoid mb-4">
                <div class="px-5 pt-4">
                  <div class="flex items-center gap-2 text-sm font-medium text-amber-300/80 mb-2 [&_svg]:size-4">
                    <UIcon name="lucide:shield" class="w-5 h-5" />
                    <span>{{ $t('hearthstone.search.command.faction') }}</span>
                  </div>
                  <div class="panel-divider"/>
                </div>
                <div class="px-5 pb-5">
                  <div class="flex flex-wrap gap-2">
                    <button
                      v-for="item in factionItems"
                      :key="item.value"
                      class="chip-btn"
                      :class="{ active: state.factions.includes(item.value) }"
                      @click="toggleMulti(state.factions, item.value)"
                    >
                      <span class="whitespace-nowrap">{{ item.label }}</span>
                    </button>
                  </div>
                </div>
              </div>

              <!-- Spell School -->
              <div class="rounded-2xl overflow-hidden backdrop-blur-sm shadow-[0_4px_16px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.05)] border border-[rgba(180,120,50,0.25)] bg-[rgba(50,28,8,0.75)] break-inside-avoid mb-4">
                <div class="px-5 pt-4">
                  <div class="flex items-center gap-2 text-sm font-medium text-amber-300/80 mb-2 [&_svg]:size-4">
                    <UIcon name="lucide:sparkles" class="w-5 h-5" />
                    <span>{{ $t('hearthstone.search.command.spell-school') }}</span>
                  </div>
                  <div class="panel-divider"/>
                </div>
                <div class="px-5 pb-5">
                  <div class="flex flex-wrap gap-2">
                    <button
                      v-for="item in spellSchoolItems"
                      :key="item.value"
                      class="chip-btn"
                      :class="{ active: state.spellSchools.includes(item.value) }"
                      @click="toggleMulti(state.spellSchools, item.value)"
                    >
                      <span class="whitespace-nowrap">{{ item.label }}</span>
                    </button>
                  </div>
                </div>
              </div>

              <!-- Rarity -->
              <div class="rounded-2xl overflow-hidden backdrop-blur-sm shadow-[0_4px_16px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.05)] border border-[rgba(180,120,50,0.25)] bg-[rgba(50,28,8,0.75)] break-inside-avoid mb-4">
                <div class="px-5 pt-4">
                  <div class="flex items-center gap-2 text-sm font-medium text-amber-300/80 mb-2 [&_svg]:size-4">
                    <UIcon name="lucide:star" class="w-5 h-5" />
                    <span>{{ $t('hearthstone.search.command.rarity') }}</span>
                  </div>
                  <div class="panel-divider"/>
                </div>
                <div class="px-5 pb-5">
                  <div class="flex flex-wrap gap-2">
                    <button
                      v-for="item in rarityItems"
                      :key="item.value"
                      class="chip-btn"
                      :class="{ active: state.rarities.includes(item.value) }"
                      @click="toggleMulti(state.rarities, item.value)"
                    >
                      <span class="whitespace-nowrap">{{ item.label }}</span>
                    </button>
                  </div>
                </div>
              </div>

          <!-- Stats Section -->
          <div class="rounded-2xl overflow-hidden backdrop-blur-sm shadow-[0_4px_16px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.05)] border border-[rgba(180,120,50,0.25)] bg-[rgba(50,28,8,0.75)] break-inside-avoid mb-4">
            <div class="px-5 pt-4">
              <div class="flex items-center gap-2 text-base font-semibold text-amber-200 mb-3 [&_svg]:drop-shadow-[0_0_8px_rgba(255,160,50,0.4)]">
                <UIcon name="lucide:bar-chart-2" class="w-5 h-5" />
                <span>{{ $t('hearthstone.search.advanced.sectionStats') }}</span>
              </div>
              <div class="panel-divider"/>
            </div>

            <div class="px-5 pb-5 space-y-6">
              <!-- Attack -->
              <div class="mb-6 last:mb-0">
                <div class="flex items-center gap-2 text-sm font-medium text-amber-300/80 mb-2 [&_svg]:size-4">
                  <UIcon name="lucide:sword" class="w-5 h-5" />
                  <span>{{ $t('hearthstone.search.command.attack') }}</span>
                </div>
                <div class="flex flex-wrap gap-2 mb-3">
                  <button
                    v-for="item in attackItems"
                    :key="item.value"
                    class="chip-btn"
                    :class="{ active: state.attacks.includes(item.value) }"
                    @click="toggleMulti(state.attacks, item.value)"
                  >
                    <span class="whitespace-nowrap">{{ item.label }}</span>
                  </button>
                </div>
                <div class="flex flex-col gap-2">
                  <div class="flex gap-2 items-center">
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
                  <div class="flex gap-2 items-center">
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
              <div class="mb-6 last:mb-0">
                <div class="flex items-center gap-2 text-sm font-medium text-amber-300/80 mb-2 [&_svg]:size-4">
                  <UIcon name="lucide:heart" class="w-5 h-5" />
                  <span>{{ $t('hearthstone.search.command.health') }}</span>
                </div>
                <div class="flex flex-wrap gap-2 mb-3">
                  <button
                    v-for="item in healthItems"
                    :key="item.value"
                    class="chip-btn"
                    :class="{ active: state.healths.includes(item.value) }"
                    @click="toggleMulti(state.healths, item.value)"
                  >
                    <span class="whitespace-nowrap">{{ item.label }}</span>
                  </button>
                </div>
                <div class="flex flex-col gap-2">
                  <div class="flex gap-2 items-center">
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
                  <div class="flex gap-2 items-center">
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

          <!-- Format / Organization -->
          <div class="rounded-2xl overflow-hidden backdrop-blur-sm shadow-[0_4px_16px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.05)] border border-[rgba(180,120,50,0.25)] bg-[rgba(50,28,8,0.75)] break-inside-avoid mb-4">
            <div class="px-5 pt-4">
              <div class="flex items-center gap-2 text-base font-semibold text-amber-200 mb-3 [&_svg]:drop-shadow-[0_0_8px_rgba(255,160,50,0.4)]">
                <UIcon name="lucide:book-open" class="w-5 h-5" />
                <span>{{ $t('hearthstone.search.advanced.sectionOrganization') }}</span>
              </div>
              <div class="panel-divider"/>
            </div>

            <div class="px-5 pb-5">
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
          </div>
        </div>
      </div>
    </Transition>

    <div v-if="!showResults" class="mx-auto max-w-6xl px-4 py-6">
      <div v-if="!q" class="flex flex-col items-center justify-center py-24 text-center text-gray-500 gap-3">
        <UIcon name="lucide:search" class="text-5xl" />
        <p class="text-lg font-medium">{{ $t('hearthstone.search.emptyQuery') }}</p>
        <p>{{ $t('hearthstone.search.hint') }}</p>
      </div>

      <div v-else-if="errorText" class="mb-6">
        <UAlert
          color="error"
          variant="soft"
          icon="lucide:circle-alert"
          :title="$t('hearthstone.search.failed')"
          :description="errorText"
        />
      </div>

      <div v-else-if="data != null && cards.length === 0" class="flex flex-col items-center justify-center py-24 text-center text-gray-500 gap-3">
        <UIcon name="lucide:search-x" class="text-5xl" />
        <p class="text-lg font-medium">{{ $t('hearthstone.search.noResult') }}</p>
        <p>{{ q }}</p>
      </div>
    </div>

    <!-- Grid view: full width -->
    <div v-else-if="searchLayout === 'grid'" class="px-4 py-6">
      <div class="grid grid-cols-[repeat(auto-fill,200px)] gap-2">
        <NuxtLink
          v-for="card in cards"
          :key="`${card.cardId}:${card.lang}`"
          :to="cardLink(card)"
          target="_blank"
        >
          <CardImage
            :card-id="card.cardId"
            :version="minVersion(card)"
            :lang="card.lang"
            :render-hash="card.renderHash"
            :variant="resultVariant"
            class="w-50"
          />
        </NuxtLink>
      </div>
    </div>

      <!-- List and Table views: constrained width -->
      <div v-else class="mx-auto max-w-7xl px-4 py-6">

      <!-- List view -->
      <div v-if="searchLayout === 'list'" class="flex flex-col gap-4">
        <NuxtLink
          v-for="card in cards"
          :key="`${card.cardId}:${card.lang}`"
          :to="cardLink(card)"
          class="block"
          target="_blank"
        >
          <UCard class="hover:ring-2 hover:ring-primary/30 transition overflow-visible!">
            <div class="flex flex-col gap-4 sm:flex-row">
              <div class="w-30 shrink-0 self-center sm:self-start">
                <CardImage
                  :card-id="card.cardId"
                  :version="minVersion(card)"
                  :lang="card.lang"
                  :render-hash="card.renderHash"
                  :variant="resultVariant"
                />
              </div>

              <div class="min-w-0 flex-1">
                <div class="flex flex-col gap-3 md:flex-row md:items-start">
                  <div class="min-w-0 flex-1">
                    <div class="flex items-start gap-3">
                      <h2 class="text-xl font-semibold leading-tight wrap-break-word">
                        {{ card.localization.name }}
                      </h2>

                      <ManaCost
                        v-if="card.cost != null"
                        :value="card.cost"
                        size="sm"
                      />
                    </div>

                    <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      {{ subtitle(card) }}
                    </p>

                    <p
                      v-if="previewText(card)"
                      class="mt-3 text-sm leading-6 text-gray-700 dark:text-gray-300 whitespace-pre-wrap"
                    >
                      {{ previewText(card) }}
                    </p>
                  </div>

                  <div class="flex flex-wrap gap-2 md:max-w-52 md:justify-end">
                    <UBadge v-if="stats(card)" color="neutral" variant="subtle">
                      {{ stats(card) }}
                    </UBadge>
                    <UBadge color="neutral" variant="subtle">
                      {{ setText(card.set) }}
                    </UBadge>
                    <UBadge
                      v-for="klass in card.classes"
                      :key="klass"
                      color="primary"
                      variant="soft"
                    >
                      {{ classText(klass) }}
                    </UBadge>
                  </div>
                </div>
              </div>
            </div>
          </UCard>
        </NuxtLink>
      </div>

      <!-- Table view -->
      <div v-else-if="searchLayout === 'table'" class="flex flex-col gap-3">
        <div class="flex items-center justify-end gap-2">
          <UButton
            color="neutral"
            variant="outline"
            size="sm"
            icon="lucide:copy"
            @click="copyTableData"
          >
            {{ $t('hearthstone.search.table.copy') }}
          </UButton>
          <UButton
            color="neutral"
            variant="outline"
            size="sm"
            icon="lucide:download"
            @click="exportTableData"
          >
            {{ $t('hearthstone.search.table.export') }}
          </UButton>
        </div>

        <UCard>
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead>
                <tr class="border-b border-gray-200 dark:border-gray-700">
                  <th
                    v-for="col in tableColumns"
                    :key="col.key"
                    class="px-3 py-2 text-left font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap"
                    :class="{ 'cursor-pointer hover:text-gray-700 dark:hover:text-white select-none': col.sortable }"
                    @click="col.sortable && toggleSort(col)"
                  >
                    <span class="inline-flex items-center gap-1.5">
                      <input
                        v-if="col.key !== 'detail'"
                        type="checkbox"
                        :checked="selectedColumns.includes(col.key)"
                        class="size-3 rounded"
                        @click.stop
                        @change="toggleColumn(col.key)"
                      >
                      {{ col.label }}
                      <template v-if="col.sortable && tableSortField === col.sortField">
                        <UIcon :name="tableSortDir === 'asc' ? 'lucide:arrow-up' : 'lucide:arrow-down'" class="w-3.5 h-3.5" />
                      </template>
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="card in cards"
                  :key="`${card.cardId}:${card.lang}`"
                  class="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-white/5 transition"
                >
                  <td class="px-3 py-2">
                    <CardAvatar
                      :card-id="card.cardId"
                      :version="minVersion(card)"
                      :lang="card.lang"
                      :render-hash="card.renderHash"
                      no-link
                      class="no-underline"
                    />
                  </td>
                  <td class="px-3 py-2 text-gray-700 dark:text-gray-300">
                    <ManaCost v-if="card.cost != null" :value="card.cost" size="sm" />
                  </td>
                  <td class="px-3 py-2 text-gray-700 dark:text-gray-300">{{ typeText(card.type) }}</td>
                  <td class="px-3 py-2 text-gray-700 dark:text-gray-300">{{ card.classes.map(classText).join(', ') }}</td>
                  <td class="px-3 py-2 text-gray-700 dark:text-gray-300">{{ stats(card) }}</td>
                  <td class="px-3 py-2 text-gray-700 dark:text-gray-300">{{ setText(card.set) }}</td>
                  <td class="px-3 py-2 max-w-80 truncate">
                    <UPopover
                      v-if="fullText(card)"
                      :open="textPopoverOpen[`${card.cardId}:${card.lang}`]"
                      :ui="{ content: 'max-w-lg p-3' }"
                      side="top"
                      align="center"
                    >
                      <span
                        class="text-gray-700 dark:text-gray-300 cursor-default"
                        @mouseenter="textPopoverOpen[`${card.cardId}:${card.lang}`] = true"
                        @mouseleave="textPopoverLeave(`${card.cardId}:${card.lang}`)"
                      >{{ previewText(card) }}</span>
                      <template #content>
                        <div
                          class="whitespace-pre-wrap"
                          @mouseenter="textPopoverOpen[`${card.cardId}:${card.lang}`] = true"
                          @mouseleave="textPopoverLeave(`${card.cardId}:${card.lang}`)"
                        >{{ fullText(card) }}</div>
                      </template>
                    </UPopover>
                    <span v-else class="text-gray-700 dark:text-gray-300">{{ previewText(card) }}</span>
                  </td>
                  <td class="px-3 py-2">
                    <UButton
                      size="xs"
                      variant="outline"
                      color="primary"
                      :to="cardLink(card)"
                      target="_blank"
                    >
                      {{ $t('hearthstone.search.table.columnDetail') }}
                    </UButton>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </UCard>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { HearthstoneConfig } from '@tcg-cards/model/src/user-config';
import type { CardEntityView } from '#model/hearthstone/schema/entity';
import type { NormalResult } from '#model/hearthstone/schema/search';
import { locale as localeSchema } from '#model/hearthstone/schema/basic';

import { explain as model } from '~/search';
import type { NumericOperator } from '~/composables/advanced-search';
import { useAdvancedSearch, parseIntoState } from '~/composables/advanced-search';
import { useRouteQuery } from '@vueuse/router';

definePageMeta({
  layout:    'main',
  titleType: 'input',
  actions:   [getHearthstoneActionMeta().random],
});

type SearchResponse = {
  text?:   string;
  result?: NormalResult;
  errors?: Array<{ type?: string, payload?: Record<string, any> }>;
};

const { $orpc } = useNuxtApp();
const route = useRoute('search');
const router = useRouter();
const { setActions } = useActions();
const actions = useHearthstoneActions();
const i18n = useI18n();
const { t, te } = i18n;
const toast = useToast();

setActions([actions.random]);
useTitle(() => i18n.t('hearthstone.search.$self'));

// ── Layout toggle ───────────────────────────────────────────────────────────

const { config: gameConfig, setConfig: setGameConfig } = useUserConfig<HearthstoneConfig>();

const searchLayout = computed(() => (gameConfig.value.searchLayout as string) ?? 'grid');

const layoutCycle = ['grid', 'list', 'table'] as const;

function cycleLayout() {
  const idx = layoutCycle.indexOf(searchLayout.value as typeof layoutCycle[number]);
  const next = layoutCycle[(idx + 1) % layoutCycle.length];
  setGameConfig('searchLayout', next);
}

const layoutIcon = computed(() => {
  switch (searchLayout.value) {
  case 'grid': return 'lucide:layout-grid';
  case 'list': return 'lucide:layout-list';
  case 'table': return 'lucide:table';
  default: return 'lucide:layout-grid';
  }
});

const layoutLabel = computed(() => {
  switch (searchLayout.value) {
  case 'grid': return i18n.t('hearthstone.search.layoutGrid');
  case 'list': return i18n.t('hearthstone.search.layoutList');
  case 'table': return i18n.t('hearthstone.search.layoutTable');
  default: return '';
  }
});

const subheaderReady = ref(false);

onMounted(() => {
  subheaderReady.value = true;
});

const data = ref<SearchResponse | null>(null);
const searching = ref(false);
const fetchError = ref<string | null>(null);

const q = computed(() => route.query.q as string | undefined);

const page = computed(() => {
  const value = Number(route.query.page);
  return Number.isFinite(value) && value >= 1 ? value : 1;
});

const pageSize = computed(() => {
  const value = Number(route.query.pageSize);
  return Number.isFinite(value) && value >= 1 ? value : 50;
});

const searchLang = computed(() =>
  localeSchema.safeParse(route.query.lang as string).data ?? 'zhs',
);

const gameLocale = useGameLocale();
watch(gameLocale, locale => {
  if (locale !== searchLang.value) {
    void router.replace({ query: { ...route.query, lang: locale } });
  }
});

const explained = computed(() => model.explain(q.value ?? '', (key: string, named?: Record<string, any>) => {
  const realKey = key.startsWith('$.')
    ? `hearthstone.search.${key.slice(2)}`
    : key.startsWith('#.')
      ? `hearthstone.${key.slice(2)}`
      : `search.${key}`;

  return named != null ? i18n.t(realKey, named) : i18n.t(realKey);
}));

const explainText = computed(() => {
  if (!q.value) {
    return i18n.t('hearthstone.search.hint');
  }

  return explained.value.text;
});

const dslExplained = computed(() => {
  if (!dsl.value) return '';
  const result = model.explain(dsl.value, (key: string, named?: Record<string, any>) => {
    const realKey = key.startsWith('$.')
      ? `hearthstone.search.${key.slice(2)}`
      : key.startsWith('#.')
        ? `hearthstone.${key.slice(2)}`
        : `search.${key}`;
    return named != null ? i18n.t(realKey, named) : i18n.t(realKey);
  });
  return result.text;
});

const cards = computed<CardEntityView[]>(() => data.value?.result?.result ?? []);
const total = computed(() => data.value?.result?.total ?? 0);
const elapsed = computed(() => data.value?.result?.elapsed ?? 0);
const pageCount = computed(() => data.value?.result?.totalPage ?? Math.ceil(total.value / pageSize.value));
const resultVariant = computed(() => data.value?.result?.variant ?? 'normal');

const showResults = computed(() =>
  !!q.value && !errorText.value && data.value != null && cards.value.length > 0,
);

const errorText = computed(() => {
  if (fetchError.value != null) {
    return fetchError.value;
  }

  if (explained.value.type === 'error') {
    return explained.value.text;
  }

  const firstError = data.value?.errors?.[0];

  if (firstError?.type != null) {
    return i18n.te(`search.error.${firstError.type}`)
      ? i18n.t(`search.error.${firstError.type}`, firstError.payload ?? {})
      : i18n.t('hearthstone.search.failed');
  }

  return null;
});

const cardLink = (card: CardEntityView) => ({
  path:  `/card/${card.cardId}`,
  query: { lang: card.lang },
});

const changePage = (nextPage: number) => {
  if (nextPage === page.value) {
    return;
  }

  void router.replace({
    query: {
      ...route.query,
      page: nextPage,
    },
  });
};

const classText = (value: string) => {
  return i18n.te(`hearthstone.class.${value}`)
    ? i18n.t(`hearthstone.class.${value}`)
    : value;
};

const typeText = (value: string) => {
  return i18n.te(`hearthstone.card.type.${value}`)
    ? i18n.t(`hearthstone.card.type.${value}`)
    : value;
};

const setText = (value: string) => {
  return i18n.te(`hearthstone.set.${value}`)
    ? i18n.t(`hearthstone.set.${value}`)
    : value;
};

const subtitle = (card: CardEntityView) => {
  const parts = [
    typeText(card.type),
    ...card.classes.map(classText),
  ];

  if (card.race?.length) {
    parts.push(card.race.map(r => i18n.te(`hearthstone.card.race.${r}`) ? i18n.t(`hearthstone.card.race.${r}`) : r).join('/'));
  }

  if (card.spellSchool != null) {
    parts.push(i18n.te(`hearthstone.card.spellSchool.${card.spellSchool}`)
      ? i18n.t(`hearthstone.card.spellSchool.${card.spellSchool}`)
      : card.spellSchool);
  }

  return parts.join(' · ');
};

const stats = (card: CardEntityView) => {
  if (card.attack != null && card.health != null) {
    return `${card.attack}/${card.health}`;
  }

  if (card.attack != null && card.durability != null) {
    return `${card.attack}/${card.durability}`;
  }

  if (card.armor != null) {
    return `[${card.armor}]`;
  }

  if (card.colddown != null) {
    return `#${card.colddown}`;
  }

  return null;
};

const minVersion = (card: CardEntityView) => {
  return Math.min(...card.version);
};

const formatElapsed = (ms: number) => {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(3)}s`;
};

const cleanCardText = (card: CardEntityView) => {
  const text = card.localization.displayText ?? card.localization.text ?? '';
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/\[\/?[bi]\]/gi, '')
    .replace(/\$[a-z]+(\d+)/gi, '$1')
    .replace(/#(\d+)/g, '$1')
    .replace(/\s*[(（]?\{\d+\}[)）]?/g, '')
    .replace(/\s+([.,!?;:。！？；：])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
};

const previewText = (card: CardEntityView) =>
  cleanCardText(card).slice(0, 180);

const fullText = (card: CardEntityView) =>
  cleanCardText(card);

const doSearch = async () => {
  if (!q.value) {
    data.value = null;
    fetchError.value = null;
    return;
  }

  searching.value = true;
  fetchError.value = null;

  try {
    const result = await $orpc.hearthstone.search.basic({
      q:        q.value,
      lang:     searchLang.value,
      page:     page.value,
      pageSize: pageSize.value,
    });

    if (q.value === route.query.q) {
      data.value = result as SearchResponse;
    }
  } catch {
    data.value = null;
    fetchError.value = i18n.t('hearthstone.search.failed');
  } finally {
    searching.value = false;
  }
};

// ── Table view ──────────────────────────────────────────────────────────────

interface TableColumn {
  key:        string;
  label:      string;
  sortable:   boolean;
  sortField?: string;
}

const tableColumns = computed<TableColumn[]>(() => [
  { key: 'name', label: t('hearthstone.search.table.columnName'), sortable: true, sortField: 'name' },
  { key: 'cost', label: t('hearthstone.search.table.columnCost'), sortable: true, sortField: 'cost' },
  { key: 'type', label: t('hearthstone.search.table.columnType'), sortable: true, sortField: 'type' },
  { key: 'class', label: t('hearthstone.search.table.columnClass'), sortable: true, sortField: 'class' },
  { key: 'attackHealth', label: t('hearthstone.search.table.columnAttackHealth'), sortable: true, sortField: 'stats' },
  { key: 'set', label: t('hearthstone.search.table.columnSet'), sortable: true, sortField: 'set' },
  { key: 'text', label: t('hearthstone.search.table.columnText'), sortable: false },
  { key: 'detail', label: t('hearthstone.search.table.columnDetail'), sortable: false },
]);

const tableSortField = ref<string | null>(null);
const tableSortDir = ref<'asc' | 'desc' | null>(null);

function toggleSort(col: TableColumn) {
  if (!col.sortField) return;

  if (tableSortField.value !== col.sortField) {
    tableSortField.value = col.sortField;
    tableSortDir.value = 'asc';
  } else if (tableSortDir.value === 'asc') {
    tableSortDir.value = 'desc';
  } else {
    tableSortField.value = null;
    tableSortDir.value = null;
  }

  const currentQ = q.value ?? '';
  let newQ = currentQ.replace(/\s*\border:\S+/g, '').trim();
  if (tableSortField.value && tableSortDir.value) {
    const suffix = tableSortDir.value === 'desc' ? '-' : '';
    newQ = `${newQ} order:${tableSortField.value}${suffix}`.trim();
  }

  if (newQ !== currentQ) {
    void router.replace({ query: { ...route.query, q: newQ || undefined, page: 1 } });
  }
}

const selectedColumns = ref(['name', 'cost', 'type', 'class', 'attackHealth', 'set', 'text']);

const textPopoverOpen = reactive<Record<string, boolean>>({});
const textPopoverTimers: Record<string, ReturnType<typeof setTimeout>> = {};

function textPopoverLeave(key: string) {
  textPopoverTimers[key] = setTimeout(() => {
    textPopoverOpen[key] = false;
  }, 120);
}

function toggleColumn(key: string) {
  if (selectedColumns.value.includes(key)) {
    selectedColumns.value = selectedColumns.value.filter(k => k !== key);
  } else {
    selectedColumns.value = [...selectedColumns.value, key];
  }
}

function getCellValue(card: CardEntityView, key: string): string {
  switch (key) {
  case 'name': return card.localization.name;
  case 'cost': return card.cost != null ? String(card.cost) : '';
  case 'type': return typeText(card.type);
  case 'class': return card.classes.map(classText).join(', ');
  case 'attackHealth': return stats(card) ?? '';
  case 'set': return setText(card.set);
  case 'text': return previewText(card);
  default: return '';
  }
}

function buildTSV(): string {
  const cols = selectedColumns.value;
  const header = cols.map(k => {
    const col = tableColumns.value.find(c => c.key === k);
    return col?.label ?? k;
  }).join('\t');
  const rows = cards.value.map(card =>
    cols.map(k => getCellValue(card, k).replace(/\t/g, ' ')).join('\t'),
  );
  return [header, ...rows].join('\n');
}

function buildCSV(): string {
  const cols = selectedColumns.value;
  const header = cols.map(k => {
    const col = tableColumns.value.find(c => c.key === k);
    return `"${(col?.label ?? k).replace(/"/g, '""')}"`;
  }).join(',');
  const rows = cards.value.map(card =>
    cols.map(k => `"${getCellValue(card, k).replace(/"/g, '""')}"`).join(','),
  );
  return [header, ...rows].join('\n');
}

async function copyTableData() {
  try {
    await navigator.clipboard.writeText(buildTSV());
    toast.add({ title: t('hearthstone.search.table.copied'), color: 'success' });
  } catch {
    // clipboard API may fail; silently ignore
  }
}

function exportTableData() {
  const csv = buildCSV();
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'search-results.csv';
  a.click();
  URL.revokeObjectURL(url);
}

watch([q, page, pageSize, searchLang], doSearch, { immediate: true });

const advanced = useRouteQuery('advanced');
const isAdvancedOpen = computed(() => advanced.value !== undefined);

const { state, dsl, reset } = useAdvancedSearch();

function openAdvanced() {
  reset();
  parseIntoState(route.query.q as string ?? '', state.value);
  advanced.value = null;
}

function closeAdvanced() {
  advanced.value = undefined;
}

function commitAdvancedSearch() {
  if (dsl.value === '') return;
  const query: Record<string, string> = { q: dsl.value };
  void router.replace({ path: '/search', query });
}

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

const validateNumericInput = (event: Event) => {
  const input = event.target as HTMLInputElement;
  const value = input.value;
  const cleaned = value.replace(/[^0-9]/g, '');
  if (cleaned !== value) {
    input.value = cleaned;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
};

const classColors: Record<string, string> = {
  death_knight: '#C41E3A',
  demon_hunter: '#A33000',
  druid:        '#FF7D0A',
  hunter:       '#ABD473',
  mage:         '#69CCF0',
  paladin:      '#F58CBA',
  priest:       '#FFFFFF',
  rogue:        '#FFF569',
  shaman:       '#0070DE',
  warlock:      '#9482C9',
  warrior:      '#C79C6E',
  neutral:      '#9E9E9E',
};

const getClassColorStyle = (className: string) => {
  const color = classColors[className] ?? '#9E9E9E';
  return { backgroundColor: color };
};
</script>

<style lang="scss" scoped>
.filter-panel-container {
  position: fixed;
  top: var(--ui-header-height, 64px);
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 50;
  background: rgba(35, 18, 6, 0.97);
  overflow-y: auto;
}

// Transition
.filter-panel-enter-active {
  transition: transform 0.2s ease, opacity 0.2s ease;
}
.filter-panel-leave-active {
  transition: transform 0.15s ease, opacity 0.15s ease;
}
.filter-panel-enter-from {
  transform: translateY(-10px);
  opacity: 0;
}
.filter-panel-leave-to {
  transform: translateY(-10px);
  opacity: 0;
}

// Panel divider gradient (requires linear-gradient)
.panel-divider {
  height: 1px;
  background: linear-gradient(90deg, transparent 0%, rgba(200, 150, 60, 0.4) 50%, transparent 100%);
  margin-bottom: 16px;
}

// Chip button (JS-toggled .active state cannot use Tailwind active: variant)
.chip-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid rgba(200, 150, 60, 0.5);
  background: rgba(45, 25, 8, 0.85);
  color: #f5eee0;
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;

  &:hover {
    border-color: rgba(220, 170, 80, 0.7);
    background: rgba(55, 32, 10, 0.9);
  }

  &.active {
    background: linear-gradient(135deg, rgba(200, 120, 30, 0.85) 0%, rgba(180, 90, 20, 0.95) 100%);
    border-color: rgba(240, 180, 60, 0.7);
    color: #ffffff;
    box-shadow: 0 0 12px rgba(240, 160, 40, 0.4);
  }
}

.chip-icon {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  flex-shrink: 0;
  box-shadow: 0 0 6px rgba(0, 0, 0, 0.6), inset 0 1px 2px rgba(255, 220, 180, 0.2);
}

// Cost button mana crystal (requires ::before pseudo-element)
.cost-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  cursor: pointer;
  background: none;
  border: none;
  padding: 0;
  transition: all 0.2s ease;
  filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.7));

  .cost-num {
    position: relative;
    z-index: 1;
    width: 100%;
    text-align: center;
    font-weight: bold;
    font-size: 16px;
    line-height: 1;
    color: #ffffff;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9), 0 0 8px rgba(255, 160, 50, 0.5);
  }

  .cost-plus {
    position: absolute;
    z-index: 1;
    right: 4px;
    top: 50%;
    transform: translateY(-50%);
    font-weight: bold;
    font-size: 12px;
    line-height: 1;
    color: #ffffff;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
  }

  &.cost-btn--plus {
    .cost-num { font-size: 14px; transform: translateX(-2px); }
    .cost-plus { font-size: 16px; right: 3px; }
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

  &:hover { filter: drop-shadow(0 2px 6px rgba(255, 160, 50, 0.7)); }
  &.active { filter: drop-shadow(0 0 10px rgba(255, 170, 60, 1)) brightness(1.3); }
}
</style>
