<template>
  <div class="desktop-page h-full space-y-4 overflow-y-auto">
    <div class="rounded-xl border border-slate-200 bg-white p-4">
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-puzzle" class="size-5 text-primary" />
        <h1 class="text-xl font-semibold">卡牌补全</h1>
        <div class="ml-auto flex gap-2">
          <UButton label="刷新" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="loading" @click="load" />
          <UButton
            label="投影全部补全项"
            icon="i-lucide-layers"
            color="primary"
            variant="soft"
            :loading="projectStarting"
            :disabled="projectTaskActive"
            @click="startProjectAll"
          />
          <UButton label="新增补全" icon="i-lucide-plus" @click="openCreate" />
        </div>
      </div>
      <p class="mt-1 text-sm text-muted">
        补充各数据源都缺失、但实际存在的印刷（语言、印文等）。保存后投影才会生效：可对单条立即投影，也可在下方筛选出系列后按系列投影，或投影全部补全项；删除补全并重新投影后，对应印刷会从站点撤下。
      </p>
    </div>

    <UAlert v-if="error" color="error" variant="soft" icon="i-lucide-circle-alert" :description="error" />
    <UAlert v-if="projectNote" color="success" variant="soft" icon="i-lucide-circle-check" :description="projectNote" />

    <!-- project all commits: the progress card exists only while a run is active -->
    <TaskController
      v-show="projectTaskActive"
      ref="projectController"
      title="补全项投影"
      :operations="[]"
      @completed="onProjectAllCompleted"
      @failed="onProjectAllFailed"
      @create-error="onProjectAllCreateError"
      @status-change="onProjectStatusChange"
    />
    <TaskResultCard :result="projectAllResult" :labels="PROJECT_RESULT_LABELS" />

    <!-- completion suggestions: read-only gap scan, adoption is per set or per card -->
    <div class="rounded-xl border border-slate-200 bg-white">
      <div class="flex items-center gap-2 p-4">
        <UIcon name="i-lucide-lightbulb" class="size-5 text-primary" />
        <span class="font-medium">补全建议</span>
        <span class="hidden text-sm text-muted md:inline">各来源缺失但译文已备的位置，按系列或单卡采纳；译文来自社区数据源与 Gatherer 官方页面</span>
        <div class="ml-auto flex items-center gap-2">
          <UButton
            :icon="suggestionsOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
            color="neutral"
            variant="ghost"
            aria-label="展开或收起"
            @click="suggestionsOpen = !suggestionsOpen"
          />
        </div>
      </div>
      <!-- direct entry: compute one set or one card without the full scan -->
      <div class="flex flex-wrap items-end gap-3 border-t border-slate-200 p-4">
        <UFormField label="系列代码" class="w-36">
          <UInput
            v-model="directSet"
            class="w-full font-mono"
            placeholder="如 msc"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            @keydown.enter="computeDirectSet" />
        </UFormField>
        <UButton label="计算该系列" color="neutral" variant="outline" :loading="directSetLoading" @click="computeDirectSet" />
        <UFormField label="卡牌（英文名检索）" class="min-w-56 flex-1">
          <template v-if="directCard == null">
            <UInput
              v-model="directCardSearchInput"
              class="w-full"
              placeholder="输入英文卡名检索"
              icon="i-lucide-search"
              @update:model-value="onDirectCardSearchInput"
            />
            <div v-if="directCardCandidates.length > 0" class="mt-2 max-h-48 space-y-1 overflow-y-auto">
              <button
                v-for="c in directCardCandidates"
                :key="c.oracleId"
                type="button"
                class="block w-full rounded border border-slate-200 p-2 text-left text-sm hover:border-primary-400"
                @click="chooseDirectCard(c)"
              >
                <span class="font-medium">{{ c.name }}</span>
                <span class="ml-2 font-mono text-xs text-muted">如 {{ c.set }}:{{ c.number }}</span>
              </button>
            </div>
          </template>
          <div v-else class="flex items-center justify-between gap-2">
            <span class="truncate text-sm font-medium">{{ directCard.name }}</span>
            <UButton label="重选" size="xs" color="neutral" variant="ghost" @click="resetDirectCard" />
          </div>
        </UFormField>
        <UButton
          label="计算该卡"
          color="neutral"
          variant="outline"
          :disabled="directCard == null || directSet.trim() === ''"
          :loading="directCardLoading"
          @click="computeDirectCard"
        />
      </div>
      <!-- single-card result: computed positions with per-card adoption -->
      <div v-if="cardResultOpen" class="border-t border-slate-200 p-4">
        <div class="mb-2 text-sm font-medium">{{ directCard?.name ?? '' }} 在 {{ cardResultSet }} 的可补全位置</div>
        <div v-if="cardResultError" class="mb-2 text-sm text-error">{{ cardResultError }}</div>
        <div v-if="cardResultLoading" class="text-sm text-muted">加载中…</div>
        <template v-else-if="cardResult != null">
          <div v-if="cardResult.items.length === 0" class="text-sm text-muted">
            没有可补全的位置（可能译文已存在，或已写入补全）。
          </div>
          <template v-else>
            <div class="mb-2 text-xs text-muted">
              共 {{ cardResult.total }} 条 · 可采纳 {{ cardResult.adoptable }} · 无法自动补全 {{ cardResult.ineligible }}（如可逆卡、拆分双面牌）<template v-if="cardResult.conflicts > 0"> · 两源不一致 {{ cardResult.conflicts }}（需逐条选择）</template>
            </div>
            <div class="mb-3 max-h-72 overflow-y-auto rounded border border-slate-200">
              <table class="w-full text-sm">
                <tbody>
                  <template v-for="c in cardResult.items" :key="candidateKey(c)">
                    <tr class="border-b border-slate-100">
                      <td class="p-2 font-mono text-xs">{{ c.number }}</td>
                      <td class="p-2">{{ c.cardName ?? '（未识别卡牌）' }}</td>
                      <td class="p-2 w-20">{{ langLabel(c.lang) }}</td>
                      <td class="p-2 text-muted">{{ c.summary !== '' ? c.summary : '（无译文，仅补位置）' }}</td>
                      <td class="p-2 w-44">
                        <span class="text-xs text-muted">{{ sourceLabel(c.source) }}</span>
                        <UBadge v-if="c.conflict" label="两源不一致" color="warning" variant="soft" class="ml-1" />
                        <UBadge v-else-if="!c.adoptable" label="不可补全" color="warning" variant="soft" class="ml-1" />
                      </td>
                      <td v-if="c.conflict && c.adoptable" class="p-2 w-64">
                        <div class="flex justify-end gap-1">
                          <UButton
                            label="对比"
                            size="xs"
                            color="neutral"
                            variant="outline"
                            :icon="conflictOpen[candidateKey(c)] ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                            @click="toggleConflict(candidateKey(c))"
                          />
                          <UButton label="采纳社区版" size="xs" color="primary" variant="soft" :loading="resolving === candidateKey(c) + ':mtgch'" @click="adoptOneCandidate(c, 'mtgch')" />
                          <UButton label="采纳官方版" size="xs" color="primary" variant="soft" :loading="resolving === candidateKey(c) + ':gatherer'" @click="adoptOneCandidate(c, 'gatherer')" />
                        </div>
                      </td>
                    </tr>
                    <tr v-if="c.conflict && conflictOpen[candidateKey(c)]">
                      <td colspan="6" class="bg-slate-50 p-3">
                        <div class="grid grid-cols-2 gap-3">
                          <div v-for="o in c.options" :key="o.source" class="rounded-lg border border-slate-200 bg-white p-3 text-xs">
                            <div class="mb-2 font-medium">{{ sourceLabel(o.source) }}译文</div>
                            <div v-for="(f, fi) in o.faces" :key="fi" class="mb-2 border-b border-slate-100 pb-2 last:border-0 last:pb-0">
                              <div class="mb-1 text-muted">面 {{ fi + 1 }}</div>
                              <div class="font-medium">{{ f.printedName ?? '（无印文名）' }}</div>
                              <div class="text-muted">{{ f.printedTypeLine ?? '' }}</div>
                              <div class="whitespace-pre-wrap">{{ f.printedText ?? '' }}</div>
                              <div v-if="f.flavorText" class="mt-1 italic text-muted">{{ f.flavorText }}</div>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  </template>
                </tbody>
              </table>
            </div>
            <div class="flex items-center gap-2">
              <UButton label="采纳该卡" size="xs" color="primary" variant="soft" :loading="adoptingCard" @click="cardAdoptOpen = true" />
              <span v-if="cardAdoptNote !== ''" class="text-sm text-success">{{ cardAdoptNote }}</span>
              <span v-if="itemAdoptNote !== ''" class="text-sm text-success">{{ itemAdoptNote }}</span>
            </div>
          </template>
        </template>
      </div>
      <div v-if="suggestionsOpen" class="border-t border-slate-200 p-4">
        <div class="mb-3 text-xs text-muted">列出本次计算过的系列；计算不写入任何数据，采纳后才写入补全列表。</div>
        <div v-if="suggestionError" class="mb-3 text-sm text-error">{{ suggestionError }}</div>
        <div v-if="suggestionNote !== ''" class="mb-3 text-sm text-success">{{ suggestionNote }}</div>
        <div v-if="suggestions.length === 0" class="text-sm text-muted">
          尚未计算。在上方输入系列代码后点击「计算该系列」。
        </div>
        <table v-else class="w-full text-sm">
          <thead class="border-b border-slate-200 text-left text-xs text-muted">
            <tr>
              <th class="p-2 w-32">系列</th>
              <th class="p-2 w-40">可补全位置</th>
              <th class="p-2"/>
            </tr>
          </thead>
          <tbody>
            <template v-for="s in suggestions" :key="s.code">
              <tr class="border-b border-slate-100">
                <td class="p-2 font-mono">{{ s.code }}</td>
                <td class="p-2">{{ s.candidates }}</td>
                <td class="p-2">
                  <div class="flex justify-end gap-2">
                    <UButton
                      :label="expandedSet === s.code ? '收起' : '查看'"
                      size="xs"
                      color="neutral"
                      variant="outline"
                      @click="togglePreview(s.code)"
                    />
                    <UButton label="采纳该系列" size="xs" color="primary" variant="soft" :loading="adopting === s.code" @click="confirmAdopt(s.code)" />
                  </div>
                </td>
              </tr>
              <tr v-if="expandedSet === s.code">
                <td colspan="3" class="bg-slate-50 p-3">
                  <div v-if="previewLoading" class="text-sm text-muted">加载中…</div>
                  <div v-else-if="preview == null" class="text-sm text-muted">无数据。</div>
                  <div v-else-if="preview.total === 0" class="text-sm text-muted">该系列没有可补全的位置。</div>
                  <template v-else>
                    <div class="mb-2 text-xs text-muted">
                      共 {{ preview.total }} 条 · 可采纳 {{ preview.adoptable }} · 无法自动补全 {{ preview.ineligible }}（如可逆卡、拆分双面牌）<template v-if="preview.conflicts > 0"> · 两源不一致 {{ preview.conflicts }}（需逐条选择）</template>
                    </div>
                    <div class="max-h-72 overflow-y-auto rounded border border-slate-200">
                      <table class="w-full text-sm">
                        <tbody>
                          <template v-for="c in preview.items" :key="candidateKey(c)">
                            <tr class="border-b border-slate-100">
                              <td class="p-2 font-mono text-xs">{{ c.number }}</td>
                              <td class="p-2">{{ c.cardName ?? '（未识别卡牌）' }}</td>
                              <td class="p-2 w-20">{{ langLabel(c.lang) }}</td>
                              <td class="p-2 text-muted">{{ c.summary !== '' ? c.summary : '（无译文，仅补位置）' }}</td>
                              <td class="p-2 w-44">
                                <span class="text-xs text-muted">{{ sourceLabel(c.source) }}</span>
                                <UBadge v-if="c.conflict" label="两源不一致" color="warning" variant="soft" class="ml-1" />
                                <UBadge v-else-if="!c.adoptable" label="不可补全" color="warning" variant="soft" class="ml-1" />
                              </td>
                              <td v-if="c.conflict && c.adoptable" class="p-2 w-64">
                                <div class="flex justify-end gap-1">
                                  <UButton
                                    label="对比"
                                    size="xs"
                                    color="neutral"
                                    variant="outline"
                                    :icon="conflictOpen[candidateKey(c)] ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                                    @click="toggleConflict(candidateKey(c))"
                                  />
                                  <UButton label="采纳社区版" size="xs" color="primary" variant="soft" :loading="resolving === candidateKey(c) + ':mtgch'" @click="adoptOneCandidate(c, 'mtgch')" />
                                  <UButton label="采纳官方版" size="xs" color="primary" variant="soft" :loading="resolving === candidateKey(c) + ':gatherer'" @click="adoptOneCandidate(c, 'gatherer')" />
                                </div>
                              </td>
                            </tr>
                            <tr v-if="c.conflict && conflictOpen[candidateKey(c)]">
                              <td colspan="6" class="bg-slate-50 p-3">
                                <div class="grid grid-cols-2 gap-3">
                                  <div v-for="o in c.options" :key="o.source" class="rounded-lg border border-slate-200 bg-white p-3 text-xs">
                                    <div class="mb-2 font-medium">{{ sourceLabel(o.source) }}译文</div>
                                    <div v-for="(f, fi) in o.faces" :key="fi" class="mb-2 border-b border-slate-100 pb-2 last:border-0 last:pb-0">
                                      <div class="mb-1 text-muted">面 {{ fi + 1 }}</div>
                                      <div class="font-medium">{{ f.printedName ?? '（无印文名）' }}</div>
                                      <div class="text-muted">{{ f.printedTypeLine ?? '' }}</div>
                                      <div class="whitespace-pre-wrap">{{ f.printedText ?? '' }}</div>
                                      <div v-if="f.flavorText" class="mt-1 italic text-muted">{{ f.flavorText }}</div>
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          </template>
                        </tbody>
                      </table>
                    </div>
                    <div v-if="itemAdoptNote !== ''" class="mt-2 text-sm text-success">{{ itemAdoptNote }}</div>
                  </template>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </div>

    <!-- filters -->
    <div class="rounded-xl border border-slate-200 bg-white p-4">
      <div class="flex flex-wrap items-end gap-4">
        <UFormField label="系列" class="w-40">
          <USelect v-model="setFilter" :items="setItems" class="w-full" />
        </UFormField>
        <UFormField label="卡牌" class="flex-1 min-w-48">
          <UInput v-model="searchInput" placeholder="英文名检索" icon="i-lucide-search" @keydown.enter="applySearch" />
        </UFormField>
        <UButton label="查询" icon="i-lucide-search" @click="applySearch" />
        <UButton
          label="投影该系列"
          icon="i-lucide-layers"
          color="primary"
          variant="soft"
          :disabled="setFilter === 'all' || projectTaskActive || projectStarting"
          :loading="projectStarting"
          @click="startProjectSet"
        />
      </div>
    </div>

    <!-- rows -->
    <div class="rounded-xl border border-slate-200 bg-white">
      <div v-if="items.length === 0" class="p-6 text-sm text-muted">没有符合条件的补全记录。</div>
      <table v-else class="w-full text-sm">
        <thead class="border-b border-slate-200 text-left text-xs text-muted">
          <tr>
            <th class="p-3">卡牌</th>
            <th class="p-3 w-40">位置</th>
            <th class="p-3 w-20">语言</th>
            <th class="p-3">印文摘要</th>
            <th class="p-3 w-24">渠道</th>
            <th class="p-3 w-64">来源说明</th>
            <th class="p-3 w-32"/>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in items" :key="rowKey(row)" class="border-b border-slate-100 last:border-0">
            <td class="p-3 font-medium">{{ row.cardName ?? '（未识别卡牌）' }}</td>
            <td class="p-3 font-mono text-xs">{{ row.set }}:{{ row.number }}</td>
            <td class="p-3">{{ langLabel(row.lang) }}</td>
            <td class="p-3">
              <template v-if="row.summary !== ''">{{ row.summary }}</template>
              <span v-else class="text-muted">（无印文，投影时回落英文）</span>
              <UBadge v-if="row.asserted > 1" :label="row.asserted + ' 面'" color="neutral" variant="soft" class="ml-2" />
            </td>
            <td class="p-3 text-xs text-muted">{{ originLabel(row.origin) }}</td>
            <td class="p-3 text-xs text-muted">{{ row.note ?? '' }}</td>
            <td class="p-3">
              <div class="flex justify-end gap-2">
                <UButton label="投影" size="xs" color="neutral" variant="outline" :loading="projectingRow === rowKey(row)" @click="projectOneCommit(row)" />
                <UButton label="编辑" size="xs" color="neutral" variant="outline" @click="openEdit(row)" />
                <UButton label="删除" size="xs" color="error" variant="ghost" @click="confirmRemove(row)" />
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <div v-if="total > pageSize" class="flex items-center justify-between border-t border-slate-200 p-3 text-sm">
        <span class="text-muted">共 {{ total }} 条 · 第 {{ page }} / {{ pageCount }} 页</span>
        <div class="flex gap-2">
          <UButton label="上一页" size="xs" color="neutral" variant="soft" :disabled="page <= 1" @click="go(page - 1)" />
          <UButton label="下一页" size="xs" color="neutral" variant="soft" :disabled="page >= pageCount" @click="go(page + 1)" />
        </div>
      </div>
    </div>

    <!-- entry / edit dialog -->
    <UModal v-model:open="formOpen" :title="formTitle" :ui="{ content: 'max-w-2xl' }">
      <template #body>
        <div class="space-y-4">
          <div v-if="formError" class="rounded-lg border border-error-200 bg-error-50 p-3 text-sm text-error">{{ formError }}</div>

          <!-- card picker (locked once chosen; edit reuses the row's card) -->
          <div class="rounded-lg border border-slate-200 p-3">
            <div class="mb-2 text-xs text-muted">卡牌</div>
            <template v-if="form.card == null">
              <UInput
                v-model="cardSearchInput"
                class="w-full"
                placeholder="输入英文卡名检索"
                icon="i-lucide-search"
                @update:model-value="onCardSearchInput"
              />
              <div v-if="candidates.length > 0" class="mt-2 max-h-48 space-y-1 overflow-y-auto">
                <button
                  v-for="c in candidates"
                  :key="c.oracleId"
                  type="button"
                  class="block w-full rounded border border-slate-200 p-2 text-left text-sm hover:border-primary-400"
                  @click="chooseCard(c)"
                >
                  <span class="font-medium">{{ c.name }}</span>
                  <span class="ml-2 font-mono text-xs text-muted">如 {{ c.set }}:{{ c.number }}</span>
                </button>
              </div>
              <div v-else-if="cardSearchInput.trim() !== ''" class="mt-2 text-xs text-muted">无匹配卡牌。</div>
            </template>
            <div v-else class="flex items-center justify-between">
              <div>
                <span class="font-medium">{{ form.card.name }}</span>
                <span class="ml-2 text-xs text-muted">共 {{ form.card.faceNames.length }} 面</span>
              </div>
              <UButton v-if="!editing" label="重选" size="xs" color="neutral" variant="ghost" @click="resetCard" />
            </div>
          </div>

          <!-- position -->
          <div class="space-y-2">
            <div class="flex gap-3">
              <UFormField label="系列代码" class="flex-1">
                <UInput v-model="form.set" class="w-full font-mono" placeholder="如 msc" autocomplete="off" :disabled="editing || form.card == null" />
              </UFormField>
              <UFormField label="收藏编号" class="flex-1">
                <UInput v-model="form.number" class="w-full font-mono" placeholder="如 806" :disabled="editing || form.card == null" />
              </UFormField>
              <UFormField label="语言" class="flex-1">
                <USelect v-model="form.lang" :items="langItems" class="w-full" :disabled="form.card == null" />
              </UFormField>
            </div>
            <div v-if="editing" class="text-xs text-muted">
              <template v-if="formMultiverseIds != null && formMultiverseIds.length > 0">
                Gatherer 编号：{{ formMultiverseIds.join('、') }}（写入时自动解析，无需手填）
              </template>
              <template v-else>Gatherer 编号：未解析到（该位置在缓存里覆盖不全，投影后印刷不带 multiverse ID）</template>
            </div>
          </div>

          <!-- per-face printed surfaces -->
          <div v-if="form.card != null">
            <div class="mb-2 text-xs text-muted">印文（留空的字段投影时回落英文；多面卡请填对应面的内容）</div>
            <div v-for="(face, i) in form.faces" :key="i" class="mb-3 rounded-lg border border-slate-200 p-3">
              <div class="mb-2 text-xs font-medium">{{ faceLabel(i) }}</div>
              <div class="grid grid-cols-2 gap-3">
                <UFormField label="印文名" class="col-span-1">
                  <UInput v-model="face.printedName" class="w-full" />
                </UFormField>
                <UFormField label="类别行" class="col-span-1">
                  <UInput v-model="face.printedTypeLine" class="w-full" />
                </UFormField>
                <UFormField label="规则文字" class="col-span-2">
                  <UTextarea v-model="face.printedText" class="w-full" :rows="3" />
                </UFormField>
                <UFormField label="风味名" class="col-span-1">
                  <UInput v-model="face.flavorName" class="w-full" />
                </UFormField>
                <UFormField label="画师" class="col-span-1">
                  <UInput v-model="face.artist" class="w-full" />
                </UFormField>
                <UFormField label="风味文字" class="col-span-2">
                  <UTextarea v-model="face.flavorText" class="w-full" :rows="2" />
                </UFormField>
                <UFormField label="水印" class="col-span-1">
                  <UInput v-model="face.watermark" class="w-full" />
                </UFormField>
              </div>
            </div>
          </div>

          <!-- optional overrides + note -->
          <div class="flex gap-3">
            <UFormField label="稀有度（可选覆盖）" class="flex-1">
              <USelect v-model="form.rarity" :items="rarityItems" class="w-full" />
            </UFormField>
            <UFormField label="发行日期（可选覆盖）" class="flex-1">
              <UInput v-model="form.releaseDate" class="w-full" placeholder="YYYY-MM-DD" />
            </UFormField>
          </div>
          <UFormField label="来源说明" help="这条数据从哪里来，便于日后核对。">
            <UTextarea v-model="form.note" class="w-full" :rows="2" placeholder="如：mtgch 数据 + 实物照片核对" />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton label="取消" color="neutral" variant="ghost" @click="formOpen = false" />
          <UButton label="保存" color="primary" :loading="saving" @click="save" />
        </div>
      </template>
    </UModal>

    <!-- delete confirmation -->
    <UModal v-model:open="removeOpen" title="删除补全">
      <template #body>
        <p class="text-sm">
          删除后重新投影，该印刷（{{ removeSummary }}）会从站点撤下。确定删除？
        </p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton label="取消" color="neutral" variant="ghost" @click="removeOpen = false" />
          <UButton label="删除" color="error" :loading="removing" @click="doRemove" />
        </div>
      </template>
    </UModal>
    <!-- adopt confirmation -->
    <UModal v-model:open="adoptOpen" :title="'采纳系列 ' + adoptSet">
      <template #body>
        <p class="text-sm">
          将把该系列所有可自动补全的位置写入补全列表（含多种语言，译文来源以各行标记为准）。简中两个来源译文不一致的位置不会自动写入，需在候选列表中逐条选择。运行投影后生效。继续？
        </p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton label="取消" color="neutral" variant="ghost" @click="adoptOpen = false" />
          <UButton label="采纳" color="primary" :loading="adopting !== null" @click="doAdopt" />
        </div>
      </template>
    </UModal>
    <!-- single-card adopt confirmation -->
    <UModal v-model:open="cardAdoptOpen" :title="'采纳卡牌 ' + (directCard?.name ?? '')">
      <template #body>
        <p class="text-sm">
          将把该卡在系列 {{ cardResultSet }} 可自动补全的位置写入补全列表（含多种语言，译文来源以各行标记为准）。简中两个来源译文不一致的位置不会自动写入，需在候选列表中逐条选择。运行投影后生效。继续？
        </p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton label="取消" color="neutral" variant="ghost" @click="cardAdoptOpen = false" />
          <UButton label="采纳" color="primary" :loading="adoptingCard" @click="doAdoptCard" />
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import type { TaskPageSnapshot, TaskRunStatus } from '@tcg-cards/model/task';
import type { TaskOperation } from '~/components/task/TaskController.vue';
import { orpc } from '~/lib/orpc';

definePageMeta({ layout: 'admin', title: '卡牌补全' });

interface CommitRow {
  oracleId:  string;
  set:       string;
  number:    string;
  lang:      string;
  cardName:  string | null;
  origin:    string;
  note:      string | null;
  summary:   string;
  asserted:  number;
  updatedAt: string;
}

interface CardCandidate {
  oracleId:  string;
  name:      string;
  set:       string;
  number:    string;
  faceNames: string[];
}

interface FaceForm {
  printedName:     string;
  printedTypeLine: string;
  printedText:     string;
  flavorName:      string;
  flavorText:      string;
  artist:          string;
  watermark:       string;
}

const loading = ref(false);
const saving = ref(false);
const removing = ref(false);
const error = ref('');

const items = ref<CommitRow[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = 50;
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize)));
const sets = ref<Array<{ code: string, commits: number }>>([]);

const setFilter = ref('all');
const searchInput = ref('');
const search = ref('');

const langItems = [
  { label: '简体中文', value: 'zhs' },
  { label: '繁体中文', value: 'zht' },
  { label: '日文', value: 'ja' },
  { label: '韩文', value: 'ko' },
  { label: '法文', value: 'fr' },
  { label: '德文', value: 'de' },
  { label: '西班牙文', value: 'es' },
  { label: '意大利文', value: 'it' },
  { label: '葡萄牙文', value: 'pt' },
  { label: '俄文', value: 'ru' },
];

const rarityItems = [
  { label: '（不覆盖）', value: 'none' },
  { label: '秘稀', value: 'mythic' },
  { label: '金', value: 'rare' },
  { label: '银', value: 'uncommon' },
  { label: '普', value: 'common' },
  { label: '特别', value: 'special' },
  { label: '奖励', value: 'bonus' },
];

function langLabel(lang: string): string {
  return langItems.find(i => i.value === lang)?.label ?? lang;
}

function originLabel(origin: string): string {
  const labels: Record<string, string> = { manual: '手工', auto: '候选', batch: '批量' };
  return labels[origin] ?? origin;
}

function rowKey(row: Pick<CommitRow, 'oracleId' | 'set' | 'number' | 'lang'>): string {
  return `${row.oracleId}:${row.set}:${row.number}:${row.lang}`;
}

const setItems = computed(() => [
  { label: '全部系列', value: 'all' },
  ...sets.value.map(s => ({ label: `${s.code}（${s.commits}）`, value: s.code })),
]);

/** Face label for the form section: the card's own face name, or a positional fallback. */
function faceLabel(index: number): string {
  const name = form.card?.faceNames[index];
  return name != null && name !== '' ? name : `面 ${index + 1}`;
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const res = await orpc.magic.commits.list({
      set:    setFilter.value === 'all' ? undefined : setFilter.value,
      search: search.value !== '' ? search.value : undefined,
      page:   page.value,
      pageSize,
    });
    items.value = res.items;
    total.value = res.total;
    sets.value = res.sets;
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
}

function applySearch() {
  search.value = searchInput.value.trim();
  page.value = 1;
  void load();
}

function go(next: number) {
  page.value = next;
  void load();
}

watch(setFilter, () => {
  page.value = 1;
  void load();
});

/** Lands the commit list on the given set: switching the filter triggers the
 * reload through its watch; when already selected, reload in place. */
async function showSetCommits(code: string) {
  if (setFilter.value === code) {
    page.value = 1;
    await load();
  } else {
    setFilter.value = code;
  }
}

const projectingRow = ref<string | null>(null);
const projectNote = ref('');

/** Projects one commit's card in place; the counts return synchronously. */
async function projectOneCommit(row: CommitRow) {
  projectingRow.value = rowKey(row);
  error.value = '';
  projectNote.value = '';
  try {
    const r = await orpc.magic.commits.projectOne({
      oracleId: row.oracleId, set: row.set, number: row.number, lang: row.lang,
    });
    projectNote.value = r.unresolved > 0
      ? '该卡未能定位，补全未投影。'
      : `投影完成：涉及卡牌 ${r.oracles}，写入印刷 ${r.prints}，撤下印刷 ${r.manualRecycled}。`;
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    projectingRow.value = null;
  }
}

// --- project all commits: the start button lives in the page header; the
// progress card is shown only while a run is active and hides on its
// terminal status (results stay on the TaskResultCard below) ---
const PROJECT_RESULT_LABELS: Record<string, string> = {
  oracles:        '涉及卡牌',
  unresolved:     '未能投影的卡牌',
  prints:         '写入印刷',
  printParts:     '写入印刷面',
  manualRecycled: '撤下印刷',
  sourceRecycled: '撤下过时印刷',
};

const projectController = ref<{
  execute:          (op: TaskOperation) => Promise<void>;
  currentTaskRunId: string | null;
} | null>(null);
const projectTaskActive = ref(false);
const projectStarting = ref(false);

const projectAllOperation = computed<TaskOperation>(() => ({
  key:    'project-commits',
  label:  '投影全部补全项',
  icon:   'i-lucide-layers',
  create: async () => orpc.magic.commits.projectAll({}) as Promise<TaskPageSnapshot>,
}));

const projectAllResult = ref<Record<string, unknown> | null>(null);

/** Starts the projection task through the hidden controller; the card becomes
 * visible only once a run is actually attached. */
async function startProjectAll() {
  if (projectTaskActive.value || projectStarting.value) return;
  projectStarting.value = true;
  try {
    await projectController.value?.execute(projectAllOperation.value);
    projectTaskActive.value = projectController.value?.currentTaskRunId != null;
  } finally {
    projectStarting.value = false;
  }
}

function onProjectAllCompleted(snap: TaskPageSnapshot) {
  projectAllResult.value = (snap.result as Record<string, unknown> | undefined) ?? null;
}

function onProjectAllFailed(_taskRunId: string, _errorCode: string | null, errorMessage: string | null) {
  error.value = errorMessage != null && errorMessage !== ''
    ? `投影任务失败：${errorMessage}`
    : '投影任务失败。';
}

function onProjectAllCreateError() {
  projectTaskActive.value = false;
}

const PROJECT_TERMINAL_STATUSES: readonly string[] = ['completed', 'failed', 'canceled', 'abandoned'];

function onProjectStatusChange(status: TaskRunStatus) {
  if (PROJECT_TERMINAL_STATUSES.includes(status)) projectTaskActive.value = false;
}

/** Starts a projection run scoped to the set chosen in the list filter. */
async function startProjectSet() {
  const code = setFilter.value;
  if (code === 'all' || code === '') return;
  if (projectTaskActive.value || projectStarting.value) return;
  projectStarting.value = true;
  try {
    await projectController.value?.execute({
      key:    'project-commits-set',
      label:  `投影系列 ${code}`,
      icon:   'i-lucide-layers',
      create: async () => orpc.magic.commits.projectAll({ set: code }) as Promise<TaskPageSnapshot>,
    });
    projectTaskActive.value = projectController.value?.currentTaskRunId != null;
  } finally {
    projectStarting.value = false;
  }
}

// --- entry / edit form ---
const formOpen = ref(false);
const editing = ref(false);
const formError = ref('');
const cardSearchInput = ref('');
const candidates = ref<CardCandidate[]>([]);

const form = reactive<{
  editingKey:  string | null;
  card:        CardCandidate | null;
  set:         string;
  number:      string;
  lang:        string;
  faces:       FaceForm[];
  rarity:      string;
  releaseDate: string;
  note:        string;
}>({
  editingKey:  null,
  card:        null,
  set:         '',
  number:      '',
  lang:        'zhs',
  faces:       [],
  rarity:      'none',
  releaseDate: '',
  note:        '',
});

/** Gatherer IDs fixed into the edited commit, shown read-only in the dialog. */
const formMultiverseIds = ref<number[] | null>(null);

const formTitle = computed(() => (editing.value ? '编辑补全' : '新增补全'));

let searchTimer: ReturnType<typeof setTimeout> | null = null;

function onCardSearchInput() {
  if (searchTimer != null) clearTimeout(searchTimer);
  const term = cardSearchInput.value.trim();
  if (term === '') {
    candidates.value = [];
    return;
  }
  searchTimer = setTimeout(async () => {
    try {
      candidates.value = await orpc.magic.commits.cardSearch({ search: term });
    } catch {
      candidates.value = [];
    }
  }, 250);
}

function emptyFaces(count: number): FaceForm[] {
  return Array.from({ length: count }, () => ({
    printedName:     '',
    printedTypeLine: '',
    printedText:     '',
    flavorName:      '',
    flavorText:      '',
    artist:          '',
    watermark:       '',
  }));
}

function chooseCard(candidate: CardCandidate) {
  form.card = candidate;
  form.faces = emptyFaces(candidate.faceNames.length);
  candidates.value = [];
  cardSearchInput.value = '';
}

function resetCard() {
  form.card = null;
  form.faces = [];
}

function openCreate() {
  editing.value = false;
  formError.value = '';
  form.editingKey = null;
  form.card = null;
  form.set = '';
  form.number = '';
  form.lang = 'zhs';
  form.faces = [];
  form.rarity = 'none';
  form.releaseDate = '';
  form.note = '';
  formMultiverseIds.value = null;
  cardSearchInput.value = '';
  candidates.value = [];
  formOpen.value = true;
}

async function openEdit(row: CommitRow) {
  editing.value = true;
  formError.value = '';
  form.editingKey = rowKey(row);
  form.set = row.set;
  form.number = row.number;
  form.lang = row.lang;
  form.rarity = 'none';
  form.releaseDate = '';
  form.note = row.note ?? '';
  try {
    const full = await orpc.magic.commits.get({
      oracleId: row.oracleId, set: row.set, number: row.number, lang: row.lang,
    });
    form.card = {
      oracleId:  row.oracleId,
      name:      row.cardName ?? '',
      set:       row.set,
      number:    row.number,
      faceNames: full.faceNames,
    };
    const faces = emptyFaces(Math.max(full.faceNames.length, full.faces.length));
    full.faces.forEach((face, i) => {
      const target = faces[i];
      if (target == null) return;
      target.printedName = face.printedName ?? '';
      target.printedTypeLine = face.printedTypeLine ?? '';
      target.printedText = face.printedText ?? '';
      target.flavorName = face.flavorName ?? '';
      target.flavorText = face.flavorText ?? '';
      target.artist = face.artist ?? '';
      target.watermark = face.watermark ?? '';
    });
    form.faces = faces;
    const data = full.data as { rarity?: string, releaseDate?: string, multiverseIds?: number[] } | null;
    form.rarity = data?.rarity ?? 'none';
    form.releaseDate = data?.releaseDate ?? '';
    formMultiverseIds.value = data?.multiverseIds ?? null;
  } catch (err) {
    formError.value = err instanceof Error ? err.message : String(err);
  }
  formOpen.value = true;
}

async function save() {
  if (form.card == null) {
    formError.value = '请先检索并选择一张卡牌。';
    return;
  }
  saving.value = true;
  formError.value = '';
  try {
    await orpc.magic.commits.save({
      oracleId: form.card.oracleId,
      set:      form.set.trim(),
      number:   form.number.trim(),
      lang:     form.lang,
      faces:    form.faces,
      data:     {
        ...(form.rarity !== 'none' && form.rarity.trim() !== '' ? { rarity: form.rarity } : {}),
        ...(form.releaseDate.trim() !== '' ? { releaseDate: form.releaseDate.trim() } : {}),
      },
      note: form.note.trim() === '' ? null : form.note.trim(),
    });
    formOpen.value = false;
    await load();
  } catch (err) {
    formError.value = err instanceof Error ? err.message : String(err);
  } finally {
    saving.value = false;
  }
}

// --- delete ---
const removeOpen = ref(false);
const removeTarget = ref<CommitRow | null>(null);

/** Position + language of the row pending deletion, for the confirm dialog text. */
const removeSummary = computed(() => {
  const target = removeTarget.value;
  if (target == null) return '';
  return `${target.set}:${target.number} ${langLabel(target.lang)}`;
});

function confirmRemove(row: CommitRow) {
  removeTarget.value = row;
  removeOpen.value = true;
}

async function doRemove() {
  const target = removeTarget.value;
  if (target == null) return;
  removing.value = true;
  error.value = '';
  try {
    await orpc.magic.commits.remove({
      oracleId: target.oracleId, set: target.set, number: target.number, lang: target.lang,
    });
    removeOpen.value = false;
    await load();
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    removing.value = false;
  }
}

onMounted(() => {
  void load();
});

// --- completion suggestions ---
interface SuggestionSet { code: string, candidates: number }
type CandidateSource = 'mtgch' | 'gatherer';

interface CandidateFaceSurface {
  printedName?:     string | null;
  printedTypeLine?: string | null;
  printedText?:     string | null;
  flavorName?:      string | null;
  flavorText?:      string | null;
}

interface CandidateOption {
  source:  CandidateSource;
  summary: string;
  faces:   CandidateFaceSurface[];
}

interface CandidateItem {
  oracleId:  string;
  set:       string;
  number:    string;
  lang:      string;
  cardName:  string | null;
  source:    CandidateSource;
  conflict:  boolean;
  options:   CandidateOption[];
  summary:   string;
  adoptable: boolean;
}

interface CandidateListResult { items: CandidateItem[], total: number, adoptable: number, ineligible: number, conflicts: number }

const suggestionsOpen = ref(false);
const suggestionError = ref('');
const suggestions = ref<SuggestionSet[]>([]);

const expandedSet = ref<string | null>(null);
const previewLoading = ref(false);
const preview = ref<CandidateListResult | null>(null);

const adopting = ref<string | null>(null);
const adoptOpen = ref(false);
const adoptSet = ref('');
const suggestionNote = ref('');

async function togglePreview(code: string) {
  if (expandedSet.value === code) {
    expandedSet.value = null;
    preview.value = null;
    return;
  }
  expandedSet.value = code;
  previewLoading.value = true;
  preview.value = null;
  try {
    preview.value = await orpc.magic.commits.candidates.list({ set: code });
  } catch (err) {
    suggestionError.value = err instanceof Error ? err.message : String(err);
    expandedSet.value = null;
  } finally {
    previewLoading.value = false;
  }
}

function confirmAdopt(code: string) {
  adoptSet.value = code;
  adoptOpen.value = true;
}

async function doAdopt() {
  const code = adoptSet.value;
  if (code === '') return;
  adopting.value = code;
  error.value = '';
  try {
    const result = await orpc.magic.commits.candidates.adopt({ set: code });
    adoptOpen.value = false;
    itemAdoptNote.value = '';
    if (result.adopted === 0 && result.conflicts === 0) {
      suggestionNote.value = '';
      error.value = '该系列没有可采纳的位置（可能均已存在或无法自动补全）。';
    } else {
      error.value = '';
      suggestionNote.value = result.conflicts > 0
        ? `已写入 ${result.adopted} 条；另有 ${result.conflicts} 条简中两源不一致，需在候选列表中逐条选择。`
        : `已写入 ${result.adopted} 条，运行投影后生效。`;
      // Reload only this set's preview (staying expanded so the remaining
      // conflict rows are ready for the per-side choice) — never the
      // all-sets suggestion scan.
      expandedSet.value = code;
      previewLoading.value = true;
      try {
        preview.value = await orpc.magic.commits.candidates.list({ set: code });
      } finally {
        previewLoading.value = false;
      }
      // Adopted rows land the commit list on the set; conflicts alone write
      // nothing, so a plain refresh suffices there.
      if (result.adopted > 0) await showSetCommits(code);
      else await load();
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    adopting.value = null;
  }
}

// --- direct entry: per-set and per-card computation without the full scan ---
const directSet = ref('');
const directSetLoading = ref(false);

const directCardSearchInput = ref('');
const directCardCandidates = ref<CardCandidate[]>([]);
const directCard = ref<CardCandidate | null>(null);
const directCardLoading = ref(false);
let directCardTimer: ReturnType<typeof setTimeout> | null = null;

const cardResultOpen = ref(false);
const cardResultSet = ref('');
const cardResultLoading = ref(false);
const cardResultError = ref('');
const cardResult = ref<CandidateListResult | null>(null);
const cardAdoptNote = ref('');

/** Stable row key of one candidate: the anchor plus its language. */
function candidateKey(item: CandidateItem): string {
  return `${item.oracleId}:${item.set}:${item.number}:${item.lang}`;
}

function sourceLabel(source: CandidateSource): string {
  return source === 'mtgch' ? '社区数据源' : 'Gatherer 官方';
}

/** Adopts one candidate position with an explicitly chosen source — the
 * resolution path for positions whose two zhs sources disagree. */
const resolving = ref<string | null>(null);
const itemAdoptNote = ref('');

/** Expanded conflict rows (candidateKey → open), showing both sources' faces. */
const conflictOpen = ref<Record<string, boolean>>({});

function toggleConflict(key: string) {
  conflictOpen.value = { ...conflictOpen.value, [key]: !conflictOpen.value[key] };
}

async function adoptOneCandidate(item: CandidateItem, source: CandidateSource) {
  resolving.value = candidateKey(item) + ':' + source;
  itemAdoptNote.value = '';
  suggestionError.value = '';
  try {
    await orpc.magic.commits.candidates.adoptOne({
      oracleId: item.oracleId, set: item.set, number: item.number, lang: item.lang, source,
    });
    itemAdoptNote.value = `已按${sourceLabel(source)}译文写入（${langLabel(item.lang)}），运行投影后生效。`;
    if (cardResultOpen.value) await computeDirectCard();
    else if (expandedSet.value != null) await togglePreview(expandedSet.value);
  } catch (err) {
    suggestionError.value = err instanceof Error ? err.message : String(err);
  } finally {
    resolving.value = null;
  }
}

const cardAdoptOpen = ref(false);
const adoptingCard = ref(false);

/** Debounced English-name search feeding the direct-entry card picker. */
function onDirectCardSearchInput() {
  if (directCardTimer != null) clearTimeout(directCardTimer);
  const term = directCardSearchInput.value.trim();
  if (term === '') {
    directCardCandidates.value = [];
    return;
  }
  directCardTimer = setTimeout(async () => {
    try {
      directCardCandidates.value = await orpc.magic.commits.cardSearch({ search: term });
    } catch {
      directCardCandidates.value = [];
    }
  }, 250);
}

function chooseDirectCard(candidate: CardCandidate) {
  directCard.value = candidate;
  directCardCandidates.value = [];
  directCardSearchInput.value = '';
}

function resetDirectCard() {
  directCard.value = null;
  cardResultOpen.value = false;
  cardResult.value = null;
  cardResultError.value = '';
  cardAdoptNote.value = '';
}

/** Computes one set's candidates straight from its code and expands its row
 * in the scan table, so adoption reuses the per-set flow. */
async function computeDirectSet() {
  const code = directSet.value.trim().toLowerCase();
  if (code === '') {
    suggestionError.value = '请先输入系列代码。';
    return;
  }
  directSetLoading.value = true;
  suggestionError.value = '';
  try {
    const res = await orpc.magic.commits.candidates.list({ set: code });
    const row = { code, candidates: res.total };
    const existing = suggestions.value.findIndex(s => s.code === code);
    if (existing >= 0) suggestions.value[existing] = row;
    else suggestions.value.push(row);
    suggestionsOpen.value = true;
    expandedSet.value = code;
    previewLoading.value = false;
    preview.value = res;
  } catch (err) {
    suggestionError.value = err instanceof Error ? err.message : String(err);
  } finally {
    directSetLoading.value = false;
  }
}

/** Computes one card's candidate positions within the entered set. */
async function computeDirectCard() {
  const card = directCard.value;
  const code = directSet.value.trim().toLowerCase();
  if (card == null || code === '') return;
  directCardLoading.value = true;
  cardResultOpen.value = true;
  cardResultSet.value = code;
  cardResultLoading.value = true;
  cardResultError.value = '';
  cardAdoptNote.value = '';
  try {
    cardResult.value = await orpc.magic.commits.candidates.list({ set: code, oracleId: card.oracleId });
  } catch (err) {
    cardResultError.value = err instanceof Error ? err.message : String(err);
    cardResult.value = null;
  } finally {
    directCardLoading.value = false;
    cardResultLoading.value = false;
  }
}

/** Adopts the computed card's positions, then re-runs the computation so the
 * result reflects what is left (usually nothing) and refreshes the commit list. */
async function doAdoptCard() {
  const card = directCard.value;
  const code = cardResultSet.value;
  if (card == null || code === '') return;
  adoptingCard.value = true;
  error.value = '';
  try {
    const result = await orpc.magic.commits.candidates.adopt({ set: code, oracleId: card.oracleId });
    cardAdoptOpen.value = false;
    await computeDirectCard();
    cardAdoptNote.value = result.adopted > 0 || result.conflicts > 0
      ? `已写入 ${result.adopted} 条${result.conflicts > 0 ? `，另有 ${result.conflicts} 条简中两源不一致，请逐条选择` : ''}。`
      : '没有可采纳的位置（可能均已存在或无法自动补全）。';
    if (result.adopted > 0) await showSetCommits(code);
    else await load();
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    adoptingCard.value = false;
  }
}
</script>
