<template>
  <div class="space-y-4">
    <UCard>
      <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-database" class="size-5 text-primary" />
            <h1 class="text-xl font-semibold">万智牌数据导入</h1>
          </div>
          <p class="mt-1 text-sm text-muted">
            只读展示当前生效的 P0 导入策略快照，不触发导入、审批或写库。
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <UBadge
            v-if="snapshot"
            :label="snapshot.version"
            color="primary"
            variant="soft"
          />
          <UBadge
            v-if="snapshot"
            :label="formatDate(snapshot.publishedAt)"
            color="neutral"
            variant="soft"
          />
          <UButton
            icon="i-lucide-refresh-cw"
            label="刷新快照"
            color="neutral"
            variant="ghost"
            :loading="loading"
            @click="loadSnapshot"
          />
        </div>
      </div>
    </UCard>

    <UCard v-if="loading && !snapshot">
      <div class="flex items-center justify-center py-12">
        <UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-muted" />
      </div>
    </UCard>

    <UCard v-else-if="!snapshot">
      <div class="py-12 text-center">
        <UIcon name="i-lucide-circle-alert" class="mx-auto size-8 text-muted" />
        <p class="mt-3 text-sm text-muted">{{ errorMessage ?? '暂无导入快照数据' }}</p>
      </div>
    </UCard>

    <template v-else>
      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <UCard class="bg-elevated">
          <div class="text-xs text-muted">来源</div>
          <div class="mt-1 text-2xl font-semibold">{{ snapshot.metadata.totals.sources }}</div>
        </UCard>
        <UCard class="bg-elevated">
          <div class="text-xs text-muted">字段</div>
          <div class="mt-1 text-2xl font-semibold">{{ snapshot.metadata.totals.fields }}</div>
        </UCard>
        <UCard class="bg-elevated">
          <div class="text-xs text-muted">策略</div>
          <div class="mt-1 text-2xl font-semibold">{{ snapshot.metadata.totals.policies }}</div>
        </UCard>
        <UCard class="bg-elevated">
          <div class="text-xs text-muted">自动应用</div>
          <div class="mt-1 text-2xl font-semibold text-success">{{ snapshot.metadata.totals.autoApply }}</div>
        </UCard>
        <UCard class="bg-elevated">
          <div class="text-xs text-muted">批量审批</div>
          <div class="mt-1 text-2xl font-semibold text-warning">{{ snapshot.metadata.totals.batchReview }}</div>
        </UCard>
        <UCard class="bg-elevated">
          <div class="text-xs text-muted">人工审批</div>
          <div class="mt-1 text-2xl font-semibold text-error">{{ snapshot.metadata.totals.manualReview }}</div>
        </UCard>
      </div>

      <UCard>
        <UTabs
          :items="tabs"
          variant="link"
        >
          <template #overview>
            <div class="space-y-4 pt-4">
              <div class="grid gap-4 xl:grid-cols-2">
                <UCard
                  v-for="source in snapshot.sources"
                  :key="source.sourceId"
                  :class="source.official ? 'ring-2 ring-primary/30' : ''"
                >
                  <div class="flex items-start gap-3">
                    <div class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <UIcon :name="sourceIcon(source.sourceId)" class="size-5" />
                    </div>

                    <div class="min-w-0 flex-1 space-y-3">
                      <div class="flex flex-wrap items-center gap-2">
                        <h3 class="font-semibold">{{ source.name }}</h3>
                        <UBadge
                          v-if="source.official"
                          label="官方"
                          color="primary"
                          size="xs"
                          variant="soft"
                        />
                        <UBadge
                          :label="sourceStatusLabel(source.status)"
                          :color="source.status === 'enabled' ? 'success' : 'neutral'"
                          size="xs"
                          variant="soft"
                        />
                        <UBadge
                          :label="trustLabel(source.trustLevel)"
                          color="info"
                          size="xs"
                          variant="soft"
                        />
                      </div>

                      <p class="text-sm text-muted">{{ source.role }}</p>

                      <div class="grid gap-2 md:grid-cols-2">
                        <div class="rounded-lg border border-default p-3">
                          <div class="text-xs text-muted">默认策略</div>
                          <UBadge
                            class="mt-1"
                            :label="strategyLabel(source.defaultStrategy)"
                            :color="strategyColor(source.defaultStrategy)"
                            variant="soft"
                          />
                        </div>
                        <div class="rounded-lg border border-default p-3">
                          <div class="text-xs text-muted">默认执行模式</div>
                          <UBadge
                            class="mt-1"
                            :label="decisionLabel(source.defaultDecisionMode)"
                            :color="decisionColor(source.defaultDecisionMode)"
                            variant="soft"
                          />
                        </div>
                      </div>

                      <div class="flex flex-wrap gap-1">
                        <UBadge
                          v-for="group in source.majorFieldGroups"
                          :key="`${source.sourceId}-${group}`"
                          :label="group"
                          color="neutral"
                          variant="outline"
                          size="xs"
                        />
                      </div>

                      <ul class="space-y-1 text-xs text-muted">
                        <li
                          v-for="note in source.notes"
                          :key="note"
                          class="flex gap-2"
                        >
                          <UIcon name="i-lucide-dot" class="mt-0.5 size-4 shrink-0" />
                          <span>{{ note }}</span>
                        </li>
                      </ul>
                    </div>
                  </div>
                </UCard>
              </div>

              <UCard class="bg-elevated">
                <template #header>
                  <div class="flex items-center gap-2">
                    <UIcon name="i-lucide-check-check" class="size-4 text-primary" />
                    <span class="font-medium">编译校验</span>
                  </div>
                </template>

                <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                  <div
                    v-for="(value, key) in snapshot.metadata.validation"
                    :key="key"
                    class="rounded-lg border border-default bg-default p-3"
                  >
                    <div class="font-mono text-xs text-muted">{{ key }}</div>
                    <p class="mt-2 text-sm">{{ value }}</p>
                  </div>
                </div>
              </UCard>
            </div>
          </template>

          <template #matching>
            <div class="space-y-4 pt-4">
              <UCard>
                <template #header>
                  <div class="flex items-center justify-between">
                    <span class="font-medium">目标实体与匹配键</span>
                    <UBadge :label="`${snapshot.entities.length} 类实体`" variant="soft" />
                  </div>
                </template>

                <div class="overflow-x-auto">
                  <table class="min-w-full text-left text-sm">
                    <thead class="border-b border-default text-xs text-muted">
                      <tr>
                        <th class="px-3 py-2 font-medium">实体</th>
                        <th class="px-3 py-2 font-medium">主键</th>
                        <th class="px-3 py-2 font-medium">允许匹配键</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-default">
                      <tr
                        v-for="entity in snapshot.entities"
                        :key="entity.entityType"
                      >
                        <td class="px-3 py-3">
                          <div class="font-medium">{{ entity.label }}</div>
                          <div class="font-mono text-xs text-muted">{{ entity.entityType }}</div>
                        </td>
                        <td class="px-3 py-3">
                          <div class="flex flex-wrap gap-1">
                            <UBadge
                              v-for="key in entity.targetKey"
                              :key="`${entity.entityType}-target-${key}`"
                              :label="key"
                              color="primary"
                              variant="soft"
                              size="xs"
                            />
                          </div>
                        </td>
                        <td class="px-3 py-3">
                          <div class="flex flex-wrap gap-1">
                            <UBadge
                              v-for="key in entity.matchKeys"
                              :key="`${entity.entityType}-match-${key}`"
                              :label="key"
                              color="neutral"
                              variant="outline"
                              size="xs"
                            />
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </UCard>

              <div class="grid gap-4 xl:grid-cols-2">
                <UCard>
                  <template #header>
                    <span class="font-medium">单条字段状态语义</span>
                  </template>

                  <div class="space-y-3">
                    <div
                      v-for="rule in snapshot.fieldStates"
                      :key="rule.state"
                      class="rounded-lg border border-default p-3"
                    >
                      <div class="flex items-center justify-between gap-2">
                        <span class="font-mono text-sm">{{ rule.state }}</span>
                        <UBadge
                          :label="rule.generatesChange ? '生成候选' : '不生成候选'"
                          :color="rule.generatesChange ? 'warning' : 'neutral'"
                          variant="soft"
                          size="xs"
                        />
                      </div>
                      <p class="mt-2 text-sm text-muted">{{ rule.description }}</p>
                    </div>
                  </div>
                </UCard>

                <UCard>
                  <template #header>
                    <span class="font-medium">结构化 matcher 操作符</span>
                  </template>

                  <div class="flex flex-wrap gap-2">
                    <UBadge
                      v-for="operator in snapshot.matcherOperators"
                      :key="operator"
                      :label="operator"
                      color="neutral"
                      variant="soft"
                    />
                  </div>

                  <p class="mt-4 text-sm text-muted">
                    P0 禁止脚本、正则和跨字段表达式，只允许可序列化、可解释的结构化 matcher。
                  </p>
                </UCard>
              </div>
            </div>
          </template>

          <template #coverage>
            <div class="space-y-4 pt-4">
              <UCard>
                <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                  <UFormField label="来源">
                    <USelect v-model="selectedSource" :items="sourceOptions" class="w-full" />
                  </UFormField>
                  <UFormField label="实体">
                    <USelect v-model="selectedEntity" :items="entityOptions" class="w-full" />
                  </UFormField>
                  <UFormField label="字段族">
                    <USelect v-model="selectedGroup" :items="groupOptions" class="w-full" />
                  </UFormField>
                  <UFormField label="覆盖状态">
                    <USelect v-model="selectedCoverage" :items="coverageOptions" class="w-full" />
                  </UFormField>
                  <UFormField label="字段搜索" class="xl:col-span-2">
                    <UInput
                      v-model="query"
                      icon="i-lucide-search"
                      placeholder="搜索 fieldPath / label / reasonCode"
                    />
                  </UFormField>
                </div>

                <div class="mt-3 flex justify-end">
                  <UButton
                    icon="i-lucide-rotate-ccw"
                    label="重置筛选"
                    color="neutral"
                    variant="ghost"
                    @click="resetFilters"
                  />
                </div>
              </UCard>

              <UCard>
                <template #header>
                  <div class="flex items-center justify-between">
                    <span class="font-medium">字段来源状态矩阵</span>
                    <UBadge :label="`${coverageRows.length} 个字段`" variant="soft" />
                  </div>
                </template>

                <div class="overflow-x-auto">
                  <table class="min-w-full text-left text-sm">
                    <thead class="border-b border-default text-xs text-muted">
                      <tr>
                        <th class="min-w-64 px-3 py-2 font-medium">字段</th>
                        <th class="px-3 py-2 font-medium">实体</th>
                        <th class="px-3 py-2 font-medium">字段族</th>
                        <th
                          v-for="source in visibleSources"
                          :key="source.sourceId"
                          class="min-w-56 px-3 py-2 font-medium"
                        >
                          {{ source.name }}
                        </th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-default">
                      <tr
                        v-for="row in coverageRows"
                        :key="row.fieldPath"
                      >
                        <td class="px-3 py-3 align-top">
                          <div class="font-mono text-xs">{{ row.fieldPath }}</div>
                          <div class="mt-1 text-sm text-muted">{{ row.label }}</div>
                        </td>
                        <td class="px-3 py-3 align-top">
                          <UBadge :label="row.entityType" color="neutral" variant="soft" size="xs" />
                        </td>
                        <td class="px-3 py-3 align-top">
                          <UBadge :label="row.group" color="neutral" variant="outline" size="xs" />
                        </td>
                        <td
                          v-for="source in visibleSources"
                          :key="`${row.fieldPath}-${source.sourceId}`"
                          class="px-3 py-3 align-top"
                        >
                          <div
                            v-if="getCoverage(row, source.sourceId)"
                            class="space-y-1"
                          >
                            <UBadge
                              :label="coverageLabel(getCoverage(row, source.sourceId)!.coverage)"
                              :color="coverageColor(getCoverage(row, source.sourceId)!.coverage)"
                              variant="soft"
                              size="xs"
                            />
                            <p class="text-xs text-muted">
                              {{ getCoverage(row, source.sourceId)!.condition ?? getCoverage(row, source.sourceId)!.note }}
                            </p>
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </UCard>
            </div>
          </template>

          <template #policy>
            <div class="space-y-4 pt-4">
              <UCard>
                <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                  <UFormField label="来源">
                    <USelect v-model="selectedSource" :items="sourceOptions" class="w-full" />
                  </UFormField>
                  <UFormField label="实体">
                    <USelect v-model="selectedEntity" :items="entityOptions" class="w-full" />
                  </UFormField>
                  <UFormField label="字段族">
                    <USelect v-model="selectedGroup" :items="groupOptions" class="w-full" />
                  </UFormField>
                  <UFormField label="覆盖状态">
                    <USelect v-model="selectedCoverage" :items="coverageOptions" class="w-full" />
                  </UFormField>
                  <UFormField label="执行模式">
                    <USelect v-model="selectedDecision" :items="decisionOptions" class="w-full" />
                  </UFormField>
                  <UFormField label="字段搜索">
                    <UInput
                      v-model="query"
                      icon="i-lucide-search"
                      placeholder="搜索 fieldPath / label / reasonCode"
                    />
                  </UFormField>
                </div>

                <div class="mt-3 flex justify-end">
                  <UButton
                    icon="i-lucide-rotate-ccw"
                    label="重置筛选"
                    color="neutral"
                    variant="ghost"
                    @click="resetFilters"
                  />
                </div>
              </UCard>

              <UCard>
                <template #header>
                  <div class="flex items-center justify-between">
                    <span class="font-medium">导入策略矩阵</span>
                    <UBadge :label="`${policyRows.length} 条策略`" variant="soft" />
                  </div>
                </template>

                <div class="overflow-x-auto">
                  <table class="min-w-full text-left text-sm">
                    <thead class="border-b border-default text-xs text-muted">
                      <tr>
                        <th class="px-3 py-2 font-medium">来源</th>
                        <th class="min-w-64 px-3 py-2 font-medium">字段</th>
                        <th class="px-3 py-2 font-medium">覆盖</th>
                        <th class="px-3 py-2 font-medium">策略</th>
                        <th class="px-3 py-2 font-medium">执行模式</th>
                        <th class="px-3 py-2 font-medium">风险</th>
                        <th class="min-w-80 px-3 py-2 font-medium">规则说明</th>
                        <th class="px-3 py-2 font-medium">约束</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-default">
                      <tr
                        v-for="policy in policyRows"
                        :key="`${policy.sourceId}-${policy.fieldPath}`"
                      >
                        <td class="px-3 py-3 align-top">
                          <div class="font-medium">{{ sourceName(policy.sourceId) }}</div>
                          <div class="font-mono text-xs text-muted">{{ policy.sourceId }}</div>
                        </td>
                        <td class="px-3 py-3 align-top">
                          <div class="font-mono text-xs">{{ policy.fieldPath }}</div>
                          <div class="mt-1 text-sm text-muted">{{ policy.label }}</div>
                        </td>
                        <td class="px-3 py-3 align-top">
                          <UBadge
                            :label="coverageLabel(policy.coverage)"
                            :color="coverageColor(policy.coverage)"
                            variant="soft"
                            size="xs"
                          />
                        </td>
                        <td class="px-3 py-3 align-top">
                          <UBadge
                            :label="strategyLabel(policy.strategy)"
                            :color="strategyColor(policy.strategy)"
                            variant="soft"
                            size="xs"
                          />
                        </td>
                        <td class="px-3 py-3 align-top">
                          <UBadge
                            :label="decisionLabel(policy.decisionMode)"
                            :color="decisionColor(policy.decisionMode)"
                            variant="soft"
                            size="xs"
                          />
                        </td>
                        <td class="px-3 py-3 align-top">
                          <UBadge
                            :label="riskLabel(policy.riskLevel)"
                            :color="riskColor(policy.riskLevel)"
                            variant="soft"
                            size="xs"
                          />
                        </td>
                        <td class="px-3 py-3 align-top">
                          <div class="space-y-1">
                            <p class="text-sm">{{ policy.matcherSummary ?? policy.coverageNote }}</p>
                            <p class="font-mono text-xs text-muted">{{ policy.reasonCode }}</p>
                            <p
                              v-if="policy.batchGroupBy.length > 0"
                              class="text-xs text-muted"
                            >
                              批量键：{{ policy.batchGroupBy.join(' + ') }}
                            </p>
                          </div>
                        </td>
                        <td class="px-3 py-3 align-top">
                          <div class="flex flex-wrap gap-1">
                            <UBadge
                              :label="policy.allowExplicitNull ? '允许 explicit_null' : '不允许 explicit_null'"
                              :color="policy.allowExplicitNull ? 'warning' : 'neutral'"
                              variant="soft"
                              size="xs"
                            />
                            <UBadge
                              :label="policy.lockedPathAware ? '受锁定约束' : '无锁定约束'"
                              :color="policy.lockedPathAware ? 'primary' : 'neutral'"
                              variant="soft"
                              size="xs"
                            />
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </UCard>
            </div>
          </template>

          <template #boundary>
            <div class="space-y-4 pt-4">
              <div class="grid gap-4 xl:grid-cols-3">
                <UCard>
                  <template #header>
                    <span class="font-medium">magic_data</span>
                  </template>
                  <div class="space-y-3">
                    <div
                      v-for="table in snapshot.boundary.dataTables"
                      :key="`magic_data-${table.table}`"
                      class="rounded-lg border border-default p-3"
                    >
                      <div class="flex items-center gap-2">
                        <UBadge :label="table.table" color="primary" variant="soft" size="xs" />
                        <UBadge
                          :label="table.authoritative ? 'authoritative' : 'cached'"
                          color="neutral"
                          variant="outline"
                          size="xs"
                        />
                      </div>
                      <p class="mt-2 text-sm text-muted">{{ table.role }}</p>
                    </div>
                  </div>
                </UCard>

                <UCard>
                  <template #header>
                    <span class="font-medium">magic_app</span>
                  </template>
                  <div class="space-y-3">
                    <div
                      v-for="table in snapshot.boundary.appTables"
                      :key="`magic_app-${table.table}`"
                      class="rounded-lg border border-default p-3"
                    >
                      <div class="flex items-center gap-2">
                        <UBadge :label="table.table" color="primary" variant="soft" size="xs" />
                        <UBadge
                          :label="table.authoritative ? 'authoritative' : 'cached'"
                          color="neutral"
                          variant="outline"
                          size="xs"
                        />
                      </div>
                      <p class="mt-2 text-sm text-muted">{{ table.role }}</p>
                    </div>
                  </div>
                </UCard>

                <UCard>
                  <template #header>
                    <span class="font-medium">magic</span>
                  </template>
                  <div class="space-y-3">
                    <div
                      v-for="table in snapshot.boundary.domainTables"
                      :key="`magic-${table.table}`"
                      class="rounded-lg border border-default p-3"
                    >
                      <div class="flex items-center gap-2">
                        <UBadge :label="table.table" color="primary" variant="soft" size="xs" />
                        <UBadge
                          :label="table.authoritative ? 'authoritative' : 'cached'"
                          color="neutral"
                          variant="outline"
                          size="xs"
                        />
                      </div>
                      <p class="mt-2 text-sm text-muted">{{ table.role }}</p>
                    </div>
                  </div>
                </UCard>
              </div>

              <div class="grid gap-4 xl:grid-cols-2">
                <UCard>
                  <template #header>
                    <span class="font-medium">遗留兼容</span>
                  </template>
                  <div class="space-y-3 text-sm">
                    <div class="rounded-lg border border-default p-3">
                      <div class="font-mono text-xs text-muted">__lockedPaths</div>
                      <p class="mt-1">{{ snapshot.boundary.lockedPathPolicy }}</p>
                    </div>
                    <div class="rounded-lg border border-default p-3">
                      <div class="font-mono text-xs text-muted">__updations</div>
                      <p class="mt-1">{{ snapshot.boundary.updationPolicy }}</p>
                    </div>
                  </div>
                </UCard>

                <UCard>
                  <template #header>
                    <span class="font-medium">派生字段</span>
                  </template>
                  <div class="flex flex-wrap gap-2">
                    <UBadge
                      v-for="field in snapshot.boundary.derivedFields"
                      :key="field"
                      :label="field"
                      color="neutral"
                      variant="soft"
                    />
                  </div>
                </UCard>
              </div>

              <UCard>
                <template #header>
                  <div class="flex items-center justify-between">
                    <span class="font-medium">P1 migration 输入清单</span>
                    <UBadge :label="`${snapshot.p1Inputs.tables.length} 张表`" variant="soft" />
                  </div>
                </template>

                <div class="overflow-x-auto">
                  <table class="min-w-full text-left text-sm">
                    <thead class="border-b border-default text-xs text-muted">
                      <tr>
                        <th class="px-3 py-2 font-medium">Schema</th>
                        <th class="px-3 py-2 font-medium">表</th>
                        <th class="min-w-96 px-3 py-2 font-medium">用途</th>
                        <th class="min-w-96 px-3 py-2 font-medium">关键字段</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-default">
                      <tr
                        v-for="table in snapshot.p1Inputs.tables"
                        :key="`${table.schema}.${table.table}`"
                      >
                        <td class="px-3 py-3 align-top">
                          <UBadge :label="table.schema" color="primary" variant="soft" size="xs" />
                        </td>
                        <td class="px-3 py-3 align-top font-mono text-xs">{{ table.table }}</td>
                        <td class="px-3 py-3 align-top text-muted">{{ table.purpose }}</td>
                        <td class="px-3 py-3 align-top">
                          <div class="flex flex-wrap gap-1">
                            <UBadge
                              v-for="field in table.requiredFields"
                              :key="`${table.schema}.${table.table}.${field}`"
                              :label="field"
                              color="neutral"
                              variant="outline"
                              size="xs"
                            />
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </UCard>

              <UCard>
                <template #header>
                  <span class="font-medium">预留冷热分层字段</span>
                </template>
                <div class="flex flex-wrap gap-2">
                  <UBadge
                    v-for="field in snapshot.p1Inputs.reservedStorageFields"
                    :key="field"
                    :label="field"
                    color="neutral"
                    variant="soft"
                  />
                </div>
              </UCard>
            </div>
          </template>
        </UTabs>
      </UCard>
    </template>
  </div>
</template>

<script setup lang="ts">
import type {
  ImportCoverageState,
  ImportDecisionMode,
  ImportFieldCoverage,
  ImportPolicySnapshot,
  ImportRiskLevel,
  ImportSourceId,
  ImportStrategy,
} from '#model/magic/schema/data/import';

definePageMeta({
  layout: 'admin',
  title:  '数据源',
});

const { $orpc } = useNuxtApp();

const tabs = [
  { label: '总览', slot: 'overview' as const, icon: 'i-lucide-layout-dashboard' },
  { label: '匹配边界', slot: 'matching' as const, icon: 'i-lucide-key-round' },
  { label: '字段覆盖', slot: 'coverage' as const, icon: 'i-lucide-table-2' },
  { label: '导入策略', slot: 'policy' as const, icon: 'i-lucide-git-compare-arrows' },
  { label: '事实边界', slot: 'boundary' as const, icon: 'i-lucide-shield-check' },
];

const snapshot = ref<ImportPolicySnapshot | null>(null);
const loading = ref(false);
const errorMessage = ref<string | null>(null);

const selectedSource = ref('all');
const selectedEntity = ref('all');
const selectedGroup = ref('all');
const selectedCoverage = ref('all');
const selectedDecision = ref('all');
const query = ref('');

const sourceOptions = computed(() => [
  { label: '全部来源', value: 'all' },
  ...(snapshot.value?.sources.map(source => ({
    label: source.name,
    value: source.sourceId,
  })) ?? []),
]);

const entityOptions = computed(() => [
  { label: '全部实体', value: 'all' },
  ...(snapshot.value?.filterOptions.entityTypes.map(entityType => ({
    label: entityType,
    value: entityType,
  })) ?? []),
]);

const groupOptions = computed(() => [
  { label: '全部字段族', value: 'all' },
  ...(snapshot.value?.filterOptions.fieldGroups.map(group => ({
    label: group,
    value: group,
  })) ?? []),
]);

const coverageOptions = computed(() => [
  { label: '全部覆盖状态', value: 'all' },
  ...(snapshot.value?.filterOptions.coverageStates.map(status => ({
    label: coverageLabel(status),
    value: status,
  })) ?? []),
]);

const decisionOptions = computed(() => [
  { label: '全部执行模式', value: 'all' },
  ...(snapshot.value?.filterOptions.decisionModes.map(mode => ({
    label: decisionLabel(mode),
    value: mode,
  })) ?? []),
]);

const visibleSources = computed(() => {
  const sources = snapshot.value?.sources ?? [];

  if (selectedSource.value === 'all') {
    return sources;
  }

  return sources.filter(source => source.sourceId === selectedSource.value);
});

const visibleSourceIds = computed(() => visibleSources.value.map(source => source.sourceId));

const coverageRows = computed(() => {
  const value = snapshot.value;

  if (value === null) {
    return [];
  }

  const text = query.value.trim().toLowerCase();

  return value.fieldCoverageMatrix.filter(row => {
    const cells = row.sources.filter(cell => visibleSourceIds.value.includes(cell.sourceId));
    const matchesEntity = selectedEntity.value === 'all' || row.entityType === selectedEntity.value;
    const matchesGroup = selectedGroup.value === 'all' || row.group === selectedGroup.value;
    const matchesCoverage = selectedCoverage.value === 'all'
      || cells.some(cell => cell.coverage === selectedCoverage.value);
    const matchesSearch = text.length === 0
      || row.fieldPath.toLowerCase().includes(text)
      || row.label.toLowerCase().includes(text);

    return matchesEntity && matchesGroup && matchesCoverage && matchesSearch;
  });
});

const policyRows = computed(() => {
  const value = snapshot.value;

  if (value === null) {
    return [];
  }

  const text = query.value.trim().toLowerCase();

  return value.policies.filter(policy => {
    const matchesSource = selectedSource.value === 'all' || policy.sourceId === selectedSource.value;
    const matchesEntity = selectedEntity.value === 'all' || policy.entityType === selectedEntity.value;
    const matchesGroup = selectedGroup.value === 'all' || policy.group === selectedGroup.value;
    const matchesCoverage = selectedCoverage.value === 'all' || policy.coverage === selectedCoverage.value;
    const matchesDecision = selectedDecision.value === 'all' || policy.decisionMode === selectedDecision.value;
    const matchesSearch = text.length === 0
      || policy.fieldPath.toLowerCase().includes(text)
      || policy.label.toLowerCase().includes(text)
      || policy.reasonCode.toLowerCase().includes(text)
      || policy.coverageNote.toLowerCase().includes(text);

    return matchesSource
      && matchesEntity
      && matchesGroup
      && matchesCoverage
      && matchesDecision
      && matchesSearch;
  });
});

function getCoverage(row: ImportFieldCoverage, sourceId: string) {
  return row.sources.find(source => source.sourceId === sourceId);
}

function sourceName(sourceId: ImportSourceId) {
  return snapshot.value?.sources.find(source => source.sourceId === sourceId)?.name ?? sourceId;
}

function sourceIcon(sourceId: ImportSourceId) {
  const icons: Record<ImportSourceId, string> = {
    'magic/gatherer': 'i-lucide-wand-sparkles',
    'magic/scryfall': 'i-lucide-search',
    'magic/mtgch':    'i-lucide-languages',
    'magic/mtgjson':  'i-lucide-file-json-2',
  };

  return icons[sourceId];
}

function sourceStatusLabel(status: string) {
  const labels: Record<string, string> = {
    enabled:        '启用',
    candidate:      '候选',
    reconcile_only: '只对账',
  };

  return labels[status] ?? status;
}

function trustLabel(trustLevel: string) {
  const labels: Record<string, string> = {
    high:   '高信任',
    medium: '中信任',
  };

  return labels[trustLevel] ?? trustLevel;
}

function coverageLabel(status: ImportCoverageState) {
  const labels: Record<ImportCoverageState, string> = {
    supported:   'supported',
    conditional: 'conditional',
    unsupported: 'unsupported',
  };

  return labels[status];
}

function coverageColor(status: ImportCoverageState) {
  const colors = {
    supported:   'success',
    conditional: 'warning',
    unsupported: 'neutral',
  } as const;

  return colors[status];
}

function decisionLabel(mode: ImportDecisionMode) {
  const labels: Record<ImportDecisionMode, string> = {
    auto_apply:    'auto_apply',
    batch_review:  'batch_review',
    manual_review: 'manual_review',
  };

  return labels[mode];
}

function decisionColor(mode: ImportDecisionMode) {
  const colors = {
    auto_apply:    'success',
    batch_review:  'warning',
    manual_review: 'error',
  } as const;

  return colors[mode];
}

function strategyLabel(strategy: ImportStrategy) {
  const labels: Record<ImportStrategy, string> = {
    overwrite:              'overwrite',
    ignore:                 'ignore',
    overwrite_when_matched: 'overwrite_when_matched',
    approval_required:      'approval_required',
  };

  return labels[strategy];
}

function strategyColor(strategy: ImportStrategy) {
  const colors = {
    overwrite:              'success',
    ignore:                 'neutral',
    overwrite_when_matched: 'warning',
    approval_required:      'error',
  } as const;

  return colors[strategy];
}

function riskLabel(riskLevel: ImportRiskLevel) {
  const labels: Record<ImportRiskLevel, string> = {
    low:    'low',
    medium: 'medium',
    high:   'high',
  };

  return labels[riskLevel];
}

function riskColor(riskLevel: ImportRiskLevel) {
  const colors = {
    low:    'success',
    medium: 'warning',
    high:   'error',
  } as const;

  return colors[riskLevel];
}

function resetFilters() {
  selectedSource.value = 'all';
  selectedEntity.value = 'all';
  selectedGroup.value = 'all';
  selectedCoverage.value = 'all';
  selectedDecision.value = 'all';
  query.value = '';
}

function formatDate(value: string | undefined) {
  if (value === undefined) {
    return '-';
  }

  try {
    return new Date(value).toLocaleString('zh-CN');
  } catch {
    return value;
  }
}

async function loadSnapshot() {
  loading.value = true;
  errorMessage.value = null;

  try {
    snapshot.value = await $orpc.magic.dataSource.getSnapshot();
  } catch (caught) {
    errorMessage.value = caught instanceof Error ? caught.message : '导入快照加载失败';
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  loadSnapshot();
});
</script>
