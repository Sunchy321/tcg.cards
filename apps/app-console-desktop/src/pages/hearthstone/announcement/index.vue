<template>
  <div class="flex h-full gap-4">
    <!-- Sidebar list -->
    <div class="sticky top-0 flex max-h-[calc(100vh-6rem)] w-64 shrink-0 flex-col rounded-xl border border-slate-200 bg-white">
      <div class="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3">
        <span class="text-sm font-medium text-slate-700">公告列表</span>
        <div class="flex items-center gap-1">
          <UButton icon="i-lucide-globe" size="xs" variant="ghost" :loading="crawling" @click="handleCrawl" />
          <UButton icon="i-lucide-plus" size="xs" variant="ghost" @click="createNew" />
        </div>
      </div>
      <div class="flex-1 overflow-y-auto p-2">
        <div
          v-for="item in announcements"
          :key="item.id"
          class="group relative flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 transition-colors"
          :class="selectedId === item.id ? 'bg-primary-50 text-primary-700' : 'hover:bg-slate-100'"
          @click="selectAnnouncement(item)"
        >
          <div class="min-w-0 flex-1">
            <div class="truncate text-sm font-medium">{{ item.name }}</div>
            <div class="flex items-center gap-1 text-xs text-slate-400">
              <span>{{ item.date }}</span>
              <span>·</span>
              <span>{{ sourceLabel(item.source) }}</span>
            </div>
          </div>
          <UBadge :label="`${item.itemCount ?? 0} 条`" color="neutral" variant="soft" size="xs" class="shrink-0" />
          <UButton icon="i-lucide-trash-2" color="error" variant="ghost" size="xs" class="opacity-0 group-hover:opacity-100" @click.stop="confirmDelete(item)" />
        </div>
        <p v-if="announcements.length === 0 && !loading" class="py-8 text-center text-sm text-slate-400">暂无公告</p>
        <div v-if="loading" class="flex justify-center py-8">
          <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin text-slate-400" />
        </div>
      </div>
    </div>

    <!-- Edit panel -->
    <div class="flex min-h-0 flex-1 flex-col rounded-xl border border-slate-200 bg-white">
      <template v-if="selectedAnnouncement || isCreating">
        <div class="sticky top-0 z-10 flex items-center justify-between rounded-t-xl border-b border-slate-200 bg-white px-5 py-3">
          <span class="text-sm text-slate-500">编辑公告</span>
          <div class="flex items-center gap-2">
            <UButton v-if="form.id" icon="i-lucide-wand" label="投影" color="neutral" variant="ghost" size="sm" :loading="projecting" @click="handleProject" />
            <USelect v-model="renderLang" :items="renderLangOptions" class="w-28" />
            <UButton
              icon="i-lucide-database"
              :label="renderAllLabel"
              :color="renderAllColor"
              :loading="renderAllRun?.status === 'loading'"
              :disabled="!form.version || renderAllRun?.status === 'loading' || renderAllRun?.status === 'running'"
              @click="handleRenderAll"
            />
            <USelect :model-value="mode" :items="modeOptions" class="w-28" @update:model-value="setEditorMode($event)" />
            <UButton v-if="mode === 'form'" icon="i-lucide-plus" label="添加条目" color="primary" variant="soft" size="sm" @click="addItem" />
            <UButton label="取消" color="neutral" variant="ghost" size="sm" @click="resetForm" />
            <UButton label="保存" size="sm" :loading="saving" @click="handleSubmit" />
          </div>
        </div>
          <div class="p-5 space-y-4">
          <div class="grid grid-cols-4 gap-4">
            <UFormField label="来源" required>
              <USelect v-model="form.source" :items="sourceOptions" class="w-full" />
            </UFormField>
            <UFormField label="日期" required>
              <UInput v-model="form.date" type="date" />
            </UFormField>
            <UFormField label="生效日期">
              <UInput v-model="form.effectiveDate" type="date" />
            </UFormField>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="版本" required>
              <USelect v-model="form.version" :items="patchOptions" placeholder="选择版本" class="w-full" />
            </UFormField>
            <UFormField label="对比版本">
              <USelect :model-value="form.lastVersion ?? 'same'" :items="patchOptionsWithEmpty" placeholder="留空则与版本相同" class="w-full" @update:model-value="form.lastVersion = $event === 'same' ? undefined : Number($event)" />
            </UFormField>
          </div>
          <UFormField label="名称" required>
            <UInput v-model="form.name" placeholder="输入公告名称" />
          </UFormField>
          <UFormField label="链接">
            <div class="space-y-2">
              <div v-for="(link, index) in form.link" :key="index" class="space-y-2">
                <div class="flex gap-2">
                  <UInput v-model="link.url" placeholder="URL" class="flex-1" @update:model-value="handleUrlChange(link, $event)" />
                  <UInput v-model="link.label" placeholder="标签 (可选)" class="w-32" />
                  <UButton icon="i-lucide-external-link" size="sm" color="neutral" variant="ghost" :disabled="!link.url" @click="openUrl(link.url)" />
                  <UButton icon="i-lucide-sparkles" size="sm" color="primary" variant="ghost" :class="{ invisible: link.label !== 'blizzard' }" :disabled="!aiConfigured || !link.url" :loading="link._parsing" @click="handleAiParse(index)" />
                  <UButton icon="i-lucide-x" color="error" variant="ghost" size="sm" @click="removeLink(index)" />
                </div>
                <AnnouncementAiParsePanel
                  v-if="parseLinkIndex === index"
                  :name="form.name"
                  :link="link"
                  @result="applyParseResult"
                  @settled="onParseSettled"
                  @close="closeParsePanel(index)"
                />
              </div>
              <UButton icon="i-lucide-plus" label="添加链接" variant="ghost" size="sm" @click="addLink" />
            </div>
          </UFormField>

          <!-- Items -->
          <div class="border-t border-slate-200 pt-4">
            <div v-if="mode === 'form'" class="mb-3 flex items-center justify-between">
              <span class="text-sm font-medium text-slate-700">公告条目（{{ form.items.length }}）</span>
              <div class="flex items-center gap-1">
                <UButton v-if="form.items.length > 1" icon="i-lucide-arrow-up-down" label="排序" size="xs" variant="ghost" @click="openSortModal" />
                <UButton icon="i-lucide-trash-2" label="清空" color="error" variant="ghost" size="xs" :disabled="form.items.length === 0" @click="() => { showClearItemsModal = true; }" />
              </div>
            </div>
            <AnnouncementItemTextEditor
              v-if="mode === 'text'"
              v-model="yamlText"
              :search="textSearch"
              class="h-[70vh]"
              @parsed="handleTextParsed"
            />
            <div v-else-if="mode === 'image'" class="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-4">
              <div
                v-for="item in imageItems"
                :key="item._key"
                class="flex flex-col items-center gap-2 rounded-lg border border-slate-200 p-3"
              >
                <span class="truncate text-sm font-medium">{{ tileTitle(item) }}</span>
                <div class="flex items-center justify-center gap-2">
                  <div v-for="side in expectedSides(item.type)" :key="side" class="flex flex-col items-center gap-1">
                    <CardImage
                      class="w-28"
                      :src="previewSrc(item, side)"
                      :card-id="item.cardId"
                      :version="form.version ?? 0"
                      :type="cardMetaOf(item)?.type ?? 'minion'"
                      :variant="item.format === 'battlegrounds' ? 'battlegrounds' : 'normal'"
                      :mechanics="cardMetaOf(item)?.mechanics"
                    />
                    <span class="text-xs text-slate-400">{{ side }}</span>
                  </div>
                </div>
                <div class="flex items-center gap-1">
                  <UButton icon="i-lucide-edit" size="xs" variant="ghost" title="表单模式编辑此项" @click="jumpToItem(item)" />
                  <UButton icon="i-lucide-eye" size="xs" variant="ghost" title="预览" :loading="previewingItems[item._key]" :disabled="!form.version || !item.cardId" @click="handlePreviewItem(form.items.indexOf(item))" />
                  <UButton icon="i-lucide-database" size="xs" variant="ghost" title="写入存储" :loading="renderingItems[item._key]" :disabled="!form.version || !item.cardId" @click="handleRenderItem(form.items.indexOf(item))" />
                  <span v-if="renderErrors[item._key]" class="text-xs text-red-500">{{ renderErrors[item._key] }}</span>
                </div>
              </div>
              <p v-if="imageItems.length === 0" class="col-span-full py-8 text-center text-sm text-slate-400">暂无卡牌条目</p>
            </div>
            <div v-else class="space-y-3">
              <div v-for="(item, index) in form.items" :key="item._key" class="rounded-lg border border-slate-200">
                <div
                  class="flex cursor-pointer items-center gap-2 px-3 py-2"
                  :class="itemHasWarning(item) ? 'bg-amber-50 dark:bg-amber-500/10' : ''"
                  @click="toggleItemExpand(item._key)"
                >
                  <span v-if="itemHasWarning(item)" class="shrink-0 text-amber-500" title="待处理">
                    <UIcon name="i-lucide-triangle-alert" class="size-3.5" />
                  </span>
                  <span class="shrink-0 rounded px-1.5 py-0.5 text-xs font-medium" :class="typeColor(item.type).pill">{{ item.type }}</span>
                  <span class="truncate text-sm font-medium">{{ tileTitle(item) }}</span>
                  <span v-if="item.cardId || item.setId || item.ruleId" class="shrink-0 text-xs text-slate-500">{{ item.cardId || item.setId || item.ruleId }}</span>
                  <span class="ml-auto flex shrink-0 items-center gap-2">
                    <span v-if="idKindOf(item.type) === 'card' && itemEditState(item) !== 'none'" class="shrink-0" :title="versionDeltaTooltip(item)">
                      <UIcon name="i-lucide-tag" class="size-3.5" :class="itemEditState(item) === 'delta' ? 'text-amber-500' : 'text-primary-500'" />
                    </span>
                    <span v-if="item.status" class="text-xs text-slate-600">{{ item.status }}</span>
                    <span v-if="item.format" class="text-xs text-slate-500">{{ item.format }}</span>
                    <span v-if="item.group" class="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-200">{{ groupLabel(item.group) }}</span>
                    <UButton icon="i-lucide-plus" color="neutral" variant="ghost" size="xs" title="在当前条目后添加" @click.stop="addItemAfter(index)" />
                    <UButton icon="i-lucide-chevron-up" color="neutral" variant="ghost" size="xs" :disabled="index === 0" @click.stop="moveItem(index, -1)" />
                    <UButton icon="i-lucide-chevron-down" color="neutral" variant="ghost" size="xs" :disabled="index === form.items.length - 1" @click.stop="moveItem(index, 1)" />
                    <UButton icon="i-lucide-x" color="error" variant="ghost" size="xs" @click.stop="removeItem(index)" />
                  </span>
                </div>
                <div v-if="expandedKey === item._key" class="border-t border-slate-200 p-3">
                <div class="grid grid-cols-3 gap-x-4 gap-y-3">
                  <UFormField label="类型" required>
                    <USelect :model-value="item.type" :items="itemTypeOptions" class="w-full" @update:model-value="handleTypeChange(item, $event)" />
                  </UFormField>
                  <UFormField v-if="statusOptionsFor(item.type).length > 0" label="状态">
                    <USelect
                      v-model="item.status"
                      :items="statusOptionsFor(item.type)"
                      :color="itemHasWarning(item) ? 'warning' : undefined"
                      :leading-icon="itemHasWarning(item) ? 'i-lucide-triangle-alert' : undefined"
                      class="w-full"
                    />
                  </UFormField>
                  <UFormField label="赛制">
                    <USelect
                      :model-value="item.format === '' ? '__all__' : item.format"
                      :items="formatOptions"
                      class="w-full"
                      @update:model-value="item.format = $event === '__all__' ? '' : String($event)"
                    />
                  </UFormField>
                  <!-- Non-card types: single ID field row -->
                  <UFormField v-if="idKindOf(item.type) === 'set'" label="系列ID">
                    <div class="flex items-center gap-1">
                      <div class="min-w-0 flex-1">
                        <SetSearchSelect v-model="item.setId" :search="searchSets" :resolve="resolveSetNames" />
                      </div>
                      <UButton icon="i-lucide-list-plus" size="sm" variant="ghost" title="批量插入系列（按本条目配置）" @click="openBatchInsert(item)" />
                    </div>
                  </UFormField>
                  <UFormField v-else-if="idKindOf(item.type) === 'rule'" label="规则ID"><UInput v-model="item.ruleId" autocomplete="off" autocapitalize="none" spellcheck="false" /></UFormField>

                  <!-- Card types: identity, glow, and previews -->
                  <template v-if="idKindOf(item.type) === 'card'">
                  <div class="flex min-w-0 flex-col gap-3">
                    <UFormField label="卡牌ID">
                      <div class="flex items-center gap-1">
                        <div class="min-w-0 flex-1">
                          <CardSearchSelect v-model="item.cardId" :search="searchCards" :format="item.format" :resolve="batchedResolveCardNames" />
                        </div>
                        <UButton icon="i-lucide-list-plus" size="sm" variant="ghost" title="批量插入卡牌（按本条目配置）" @click="openBatchInsert(item)" />
                      </div>
                    </UFormField>
                    <UFormField label="关联卡牌">
                      <CardSearchSelect v-model="item.relatedCardsStr" multiple :search="searchCards" :format="item.format" :resolve="batchedResolveCardNames" placeholder="搜索并选择关联卡牌" />
                    </UFormField>
                    <UFormField label="分组">
                      <USelect :model-value="item.group || 'none'" :items="groupOptions" placeholder="无" class="w-full" @update:model-value="handleGroupSelect(item, $event)" />
                    </UFormField>
                  </div>
                  <div class="flex min-h-52 min-w-0 flex-col">
                    <template v-if="item.type === 'card_update'">
                      <div class="mb-2 flex h-8 items-center justify-between">
                        <span class="text-sm font-medium text-slate-700">高亮</span>
                        <div class="flex items-center gap-1">
                          <UButton icon="i-lucide-wand-2" label="计算高亮" size="xs" variant="ghost" :disabled="!item.cardId || glowCalculatingId === item._key" :loading="glowCalculatingId === item._key" @click="computeGlow(item)" />
                          <UButton icon="i-lucide-plus" label="添加" size="xs" variant="ghost" :disabled="(item.glow?.length ?? 0) >= glowPart.options.length" @click="addGlow(item)" />
                        </div>
                      </div>
                      <div class="flex flex-1 flex-col gap-2">
                        <div
                          v-for="(entry, glowIndex) in item.glow ?? []"
                          :key="glowIndex"
                          class="grid grid-cols-[minmax(0,1fr)_7rem_auto] items-center gap-2 rounded border px-2 py-1.5"
                          :style="glowTypeStyle(entry.type)"
                        >
                          <USelect v-model="entry.part" :items="glowPartOptions(item, glowIndex)" class="w-full" />
                          <div class="flex min-w-0 items-center gap-1.5">
                            <span class="size-2 shrink-0 rounded-full" :style="{ backgroundColor: glowTypeColors[entry.type].color }" />
                            <USelect v-model="entry.type" :items="glowTypeOptions" class="min-w-0 flex-1" />
                          </div>
                          <UButton icon="i-lucide-x" color="error" variant="ghost" size="xs" @click="removeGlow(item, glowIndex)" />
                        </div>
                      </div>
                    </template>
                  </div>
                  <div class="row-span-2 flex min-h-52 items-start justify-center gap-3">
                    <div v-for="side in expectedSides(item.type)" :key="side" class="flex flex-col items-center gap-1">
                      <CardImage
                        class="w-32"
                        :src="previewSrc(item, side)"
                        :card-id="item.cardId"
                        :version="form.version ?? 0"
                        :type="cardMetaOf(item)?.type ?? 'minion'"
                        :variant="item.format === 'battlegrounds' ? 'battlegrounds' : 'normal'"
                        :mechanics="cardMetaOf(item)?.mechanics"
                      />
                      <span
                        class="text-xs"
                        :class="previewSourceOf(item._key, side) === 'preview' ? 'font-medium text-amber-600' : 'text-slate-500'"
                      >{{ side }}</span>
                    </div>
                  </div>
                  <div class="col-span-2 flex flex-wrap items-center gap-1">
                    <UButton icon="i-lucide-tag" label="版本" size="xs" variant="ghost" :color="itemEditColor(item)" @click="openItemVersionDelta(item._key)" />
                    <UButton icon="i-lucide-eye" label="预览" size="xs" variant="ghost" :loading="previewingItems[item._key]" :disabled="!form.version || !item.cardId" @click="handlePreviewItem(index)" />
                    <UButton icon="i-lucide-download" label="下载 PNG" size="xs" variant="ghost" :loading="downloadingItems[item._key]" :disabled="!form.version || !item.cardId" @click="handleDownloadPng(index)" />
                    <UButton v-if="renderLang === 'all'" icon="i-lucide-file-json" label="下载请求" size="xs" variant="ghost" :loading="requestingItems[item._key]" :disabled="!form.version || !item.cardId" @click="handleRequest(item)" />
                    <template v-else>
                      <UButton
                        v-for="side in expectedSides(item.type)"
                        :key="`request-${side}`"
                        icon="i-lucide-copy"
                        :label="expectedSides(item.type).length === 1 ? '复制请求' : `复制${side === 'prev' ? '前图' : '后图'}请求`"
                        size="xs"
                        variant="ghost"
                        :loading="requestingItems[item._key]"
                        :disabled="!form.version || !item.cardId"
                        @click="handleRequest(item, side)"
                      />
                    </template>
                    <UButton icon="i-lucide-database" label="写入存储" size="xs" variant="ghost" :loading="renderingItems[item._key]" :disabled="!form.version || !item.cardId" @click="handleRenderItem(index)" />
                    <span v-if="renderErrors[item._key]" class="text-xs text-red-500">{{ renderErrors[item._key] }}</span>
                  </div>
                  </template>
                </div>
                </div>
              </div>
              </div>
          </div>
        </div>
      </template>
      <div v-else class="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-slate-400">
        <UIcon name="i-lucide-file-text" class="size-10 opacity-50" />
        <p class="text-sm">选择左侧公告进行编辑，或创建新公告</p>
        <UButton icon="i-lucide-plus" label="创建新公告" @click="createNew" />
      </div>
    </div>

    <UModal v-model:open="sortModalOpen" title="排序公告条目" class="sm:max-w-5xl">
      <template #body>
        <p class="mb-3 text-sm text-slate-500">拖动方块调整条目顺序，调整结果会应用到编辑表单。</p>
        <VueDraggable
          v-model="form.items"
          handle=".drag-handle"
          :animation="150"
          class="grid max-h-[70vh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4 lg:grid-cols-5"
        >
          <div
            v-for="(item, index) in form.items"
            :key="item._key"
            class="flex min-w-0 flex-col gap-1 rounded-lg border border-slate-200 p-2.5"
            :class="typeColor(item.type).tile"
          >
            <div class="flex items-center gap-1.5">
              <UIcon name="i-lucide-grip-vertical" class="drag-handle size-4 shrink-0 cursor-grab text-slate-400" />
              <span class="shrink-0 text-xs text-slate-400">{{ index + 1 }}</span>
              <span class="ml-auto shrink-0 rounded px-1.5 py-0.5 text-[11px]" :class="typeColor(item.type).pill">{{ item.type }}</span>
            </div>
            <div class="truncate text-sm font-medium">{{ tileTitle(item) }}</div>
            <div class="truncate text-xs text-slate-400">{{ tileMeta(item) }}</div>
          </div>
        </VueDraggable>
        <p v-if="form.items.length === 0" class="py-6 text-center text-sm text-slate-400">暂无条目</p>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton label="取消" color="neutral" variant="ghost" @click="cancelSort" />
          <UButton label="确定" color="primary" @click="{ sortModalOpen = false; }" />
        </div>
      </template>
    </UModal>

    <UModal v-model:open="showClearItemsModal">
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-triangle-alert" class="size-5 text-error" />
          <span class="font-medium">清空公告条目</span>
        </div>
      </template>
      <template #body>
        <p class="text-sm text-muted">将移除当前公告的 {{ form.items.length }} 个条目，此操作尚未保存。</p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton label="取消" color="neutral" variant="ghost" @click="() => { showClearItemsModal = false; }" />
          <UButton label="确认清空" color="error" @click="confirmClearItems" />
        </div>
      </template>
    </UModal>

    <UModal v-model:open="batchInsertOpen" :title="batchKind === 'set' ? '批量插入系列' : '批量插入卡牌'" class="sm:max-w-3xl">
      <template #body>
        <div class="space-y-4">
          <p class="text-xs text-slate-600">
            按当前条目配置插入：类型 <code class="rounded bg-slate-100 px-1">{{ batchTemplateType }}</code>，状态 <code class="rounded bg-slate-100 px-1">{{ batchTemplateStatus }}</code>，赛制 <code class="rounded bg-slate-100 px-1">{{ batchTemplateFormat }}</code>。插入到当前条目之后。
          </p>
          <div class="flex gap-4">
            <div class="w-2/5">
              <UFormField :label="batchKind === 'set' ? '系列名称/ID（每行一个）' : '卡牌名称（每行一个）'">
                <UTextarea v-model="batchNames" :rows="10" class="h-full w-full" :placeholder="batchKind === 'set' ? '每行一个系列名称或ID，如：核心 / CORE' : '每行一个卡牌名称，如：魔术师的高帽'" @update:model-value="batchResolved = []" />
              </UFormField>
            </div>
            <div class="min-w-0 flex-1">
              <span class="text-sm font-medium text-slate-700">解析结果</span>
              <div v-if="batchResolved.length > 0" class="mt-1 max-h-72 space-y-1 overflow-y-auto rounded border border-slate-200 p-1">
                <div v-for="(row, idx) in batchResolved" :key="idx" class="flex items-center gap-2 rounded px-2 py-1.5 text-sm">
                  <span class="w-32 shrink-0 truncate" :title="row.name">{{ row.name }}</span>
                  <span v-if="row.candidates.length === 0" class="text-xs text-red-500">未找到</span>
                  <USelect
                    v-else
                    :model-value="row.selected"
                    :items="row.candidates.map(c => ({ label: `${c.label} (${c.id})`, value: c.id }))"
                    class="min-w-0 flex-1"
                    @update:model-value="row.selected = String($event)"
                  />
                </div>
              </div>
              <p v-else class="mt-1 text-xs text-slate-400">点击下方"解析"查看匹配结果</p>
            </div>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton label="关闭" color="neutral" variant="ghost" @click="{ batchInsertOpen = false; }" />
          <UButton label="解析" color="primary" variant="soft" :loading="batchResolving" :disabled="!batchNames.trim()" @click="resolveBatchNames" />
          <UButton label="插入" color="primary" :loading="batchInserting" :disabled="insertableCount === 0" @click="confirmBatchInsert" />
        </div>
      </template>
    </UModal>

    <UModal v-model:open="showRenderAllConfirm" title="确认写入全部图片" description="将重新渲染并写入所有卡图（覆盖已存在的图片）。此操作不可撤销。">
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton label="取消" color="neutral" variant="ghost" @click="{ showRenderAllConfirm = false; }" />
          <UButton label="确认写入" color="error" @click="{ confirmRenderAll(); }" />
        </div>
      </template>
    </UModal>

    <UModal v-model:open="versionEditModalOpen" title="编辑条目" class="sm:max-w-5xl">
      <template #body>
        <div class="space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <UFormField v-if="versionEditItem?.type === 'card_update'" label="对比版本">
              <USelect :model-value="editLastVersion" :items="itemLastVersionOptions" class="w-full" @update:model-value="{ editLastVersion = $event as any; }" />
            </UFormField>
            <UFormField label="版本">
              <USelect :model-value="editVersion" :items="itemVersionOptions" class="w-full" @update:model-value="{ editVersion = $event as any; }" />
            </UFormField>
          </div>
          <div v-if="versionEditItem?.type === 'card_update'" class="grid grid-cols-2 gap-4">
            <UFormField label="修正 prev">
              <YamlEditor v-model="editDeltaPrev" height="320px" />
            </UFormField>
            <UFormField label="修正 curr">
              <YamlEditor v-model="editDeltaCurr" height="320px" />
            </UFormField>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton label="取消" color="neutral" variant="ghost" @click="{ versionEditKey = null; }" />
          <UButton label="确定" color="primary" :disabled="!editDeltaValid" @click="{ applyItemVersionDelta(); }" />
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { openUrl } from '@tauri-apps/plugin-opener';
import { useDesktopRuntimeClient } from '~/composables/useDesktopRuntimeClient';
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { VueDraggable } from 'vue-draggable-plus';
import { changeStatusByType, glowPart, group as groupEnum } from '#model/hearthstone/schema/announcement';
import type { ChangeStatus, GameChangeType, GlowEntry } from '#model/hearthstone/schema/announcement';
import type { ImageRequestOverride } from '#model/hearthstone/schema/data/image';
import type { RenderModel } from '#model/hearthstone/schema/entity';
import { mergePreviews, selectPreview, type SidePreview } from '~/utils/announcement-preview';
import { deriveGroup, idKindOf, serializeItems, type ParseError, type ParsedResult, type ResolvedCardName, type TextItem } from '~/utils/announcement-yaml';
import { isPoolFull } from '@tcg-cards/shared/hearthstone/pool';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

import { useToast } from '@nuxt/ui/composables';
import type { Locale } from '@tcg-cards/model/hearthstone/schema/basic';

definePageMeta({ layout: 'admin', title: '公告管理' });

const client = useDesktopRuntimeClient();

interface LinkEntry { url: string, label?: string, _parsing?: boolean }
/** Stores display-only render model corrections for both sides of an item. */
interface ItemDelta {
  /** `override` is routed to the render request's override, not merged into the render model. */
  prev?: Partial<RenderModel> & { override?: ImageRequestOverride };
  curr?: Partial<RenderModel> & { override?: ImageRequestOverride };
}
interface ItemForm {
  id?: string; _key: string; type: string; effectiveDate: string; format: string;
  status: ChangeStatus | 'unknown'; group: string; version?: number; lastVersion?: number;
  cardId: string; setId: string; ruleId: string; relatedCardsStr: string;
  delta: ItemDelta | null; glow: GlowEntry[] | null;
  /** Whether the group is auto-derived from format + card type (false once manually set). */
  _groupAuto?: boolean;
}

const announcements = ref<any[]>([]);
const loading = ref(false);
const selectedId = ref<string | null>(null);
const isCreating = ref(false);
const saving = ref(false);
const projecting = ref(false);
const aiConfigured = ref(false);
const crawling = ref(false);
/** Link index whose streaming AI parse panel is open; null when none. */
const parseLinkIndex = ref<number | null>(null);
/** Item key of the currently expanded item editor; accordion-style (single expanded). */
const expandedKey = ref<string>('');
/** True once the form has been loaded/hydrated; suppresses cardId refresh on initial load. */
const hydrated = ref(false);
const patches = ref<Array<{ buildNumber: number, name: string }>>([]);
const patchOptions = computed(() => patches.value.map(p => ({ label: `${p.buildNumber} · ${p.name}`, value: p.buildNumber })));
const patchOptionsWithEmpty = computed(() => [{ label: '(与版本相同)', value: 'same' }, ...patchOptions.value]);

const RENDER_LANG_KEY = 'hearthstone-announcement-render-lang';
const renderLang = ref<Locale | 'all'>((localStorage.getItem(RENDER_LANG_KEY) as Locale | 'all' | null) ?? 'zhs');
const renderLangOptions = [
  { label: '全部语言', value: 'all' },
  { label: 'en', value: 'en' }, { label: 'zhs', value: 'zhs' },
];
const glowTypeOptions = [
  { label: 'buff', value: 'buff' },
  { label: 'nerf', value: 'nerf' },
  { label: 'rework', value: 'rework' },
  { label: 'neutral', value: 'neutral' },
];
const glowTypeColors: Record<GlowEntry['type'], { color: string, colorize: string, hiColor: string }> = {
  buff:    { color: '#00BA00', colorize: '#9AFF95', hiColor: '#5ED343' },
  nerf:    { color: '#BA0505', colorize: '#FF9595', hiColor: '#D36943' },
  rework:  { color: '#D6A900', colorize: '#FFF09A', hiColor: '#FFD43B' },
  neutral: { color: '#1677C8', colorize: '#9DDCFF', hiColor: '#3B9EFF' },
};
/** Running/completed bulk render-to-storage task; null when idle. */
const renderAllRun = ref<{ mode: 'missing' | 'all', done: number, total: number, status: 'loading' | 'running' | 'done' | 'error' } | null>(null);
/** Whether the Option/Alt key is held, switching the button between missing/all modes. */
const altHeld = ref(false);
const showRenderAllConfirm = ref(false);

const renderAllLabel = computed(() => {
  const run = renderAllRun.value;
  const base = run
    ? (run.mode === 'missing' ? '写入缺失图片' : '写入全部图片')
    : (altHeld.value ? '写入全部图片' : '写入缺失图片');
  if (!run || run.status === 'loading') return base;
  return `${base} (${run.done}/${run.total})`;
});

const renderAllColor = computed(() => {
  const mode = renderAllRun.value ? renderAllRun.value.mode : (altHeld.value ? 'all' : 'missing');
  return mode === 'all' ? 'error' : 'primary';
});
const showClearItemsModal = ref(false);
const sortModalOpen = ref(false);
const sortSnapshot = ref<ItemForm[]>([]);
const batchInsertOpen = ref(false);
const batchInserting = ref(false);
const batchResolving = ref(false);
const batchNames = ref('');
/** Index of the item that acts as the batch template; -1 when none. */
const batchInsertIndex = ref(-1);
const batchTemplate = computed(() => (batchInsertIndex.value >= 0 ? form.items[batchInsertIndex.value] : null));
const batchTemplateType = computed(() => batchTemplate.value?.type ?? '');
const batchTemplateStatus = computed(() => batchTemplate.value?.status ?? '');
const batchTemplateFormat = computed(() => batchTemplate.value?.format ? batchTemplate.value.format : '全部');
/** One batch candidate carrying a display label for card or set. */
interface BatchCandidate {
  id:    string;
  label: string;
}
/** One resolved batch input with its candidate matches. */
interface BatchResolvedItem {
  name:       string;
  candidates: BatchCandidate[];
  selected:   string;
}
/** Batch insert target kind derived from the template item type. */
const batchKind = computed<'card' | 'set'>(() =>
  idKindOf(batchTemplate.value?.type ?? '') === 'set' ? 'set' : 'card',
);
const batchResolved = ref<BatchResolvedItem[]>([]);
const insertableCount = computed(() => batchResolved.value.filter(row => row.selected).length);
/** Editor view: form editor, YAML text editor, or image-only gallery. */
type EditorMode = 'form' | 'text' | 'image';
const mode = ref<EditorMode>('form');
const modeOptions = [
  { label: '表单模式', value: 'form' },
  { label: '文本编辑', value: 'text' },
  { label: '图片模式', value: 'image' },
];
const yamlText = ref('');
const textErrors = ref<ParseError[]>([]);
const textPendingCount = ref(0);
const renderingItems = reactive<Record<string, boolean>>({});
const previewingItems = reactive<Record<string, boolean>>({});
const downloadingItems = reactive<Record<string, boolean>>({});
const requestingItems = reactive<Record<string, boolean>>({});
const renderErrors = reactive<Record<string, string>>({});
const renderedItems = reactive<Record<string, boolean>>({});
const itemPreviews = reactive<Record<string, SidePreview[]>>({});
const cardMetas = reactive<Record<string, { type: string, mechanics: Record<string, boolean | number>, name: string | null, isTimewarped: boolean }>>({});

function expectedSides(type: string): string[] {
  if (type === 'card_change') return ['base'];
  if (type === 'card_update') return ['prev', 'curr'];
  return [];
}

function findPreview(itemKey: string, side: string): SidePreview | undefined {
  return selectPreview(itemPreviews[itemKey] ?? [], side, renderLang.value);
}

/** Desktop runtime origin, matching the RPC client's http://localhost:4318/rpc. */
const DESKTOP_IMAGE_BASE = 'http://localhost:4318';

/** The premium mechanic tag marking a card as golden. */
const PREMIUM_MECHANIC = '12';

/** Builds the runtime image URL for a stored card image by render hash. */
function buildImageUrl(hash: string, category: string, template: string, premium: 'normal' | 'golden' = 'normal'): string {
  return `${DESKTOP_IMAGE_BASE}/images/${category}/hand/${template}/${premium}/${hash.slice(0, 2)}/${hash}.webp?1`;
}

/** Resolves a preview side to a URL (storage) or data URL (transient render). */
function previewSrc(item: ItemForm, side: string): string | null {
  const preview = findPreview(item._key, side);
  if (!preview) return null;
  if (preview.source === 'storage' && preview.hash) {
    const premium = cardMetaOf(item)?.mechanics?.[PREMIUM_MECHANIC] ? 'golden' : 'normal';
    return buildImageUrl(preview.hash, preview.category, preview.template, premium);
  }
  return `data:${preview.mimeType ?? 'image/webp'};base64,${preview.base64}`;
}

/** Returns the source of the current preview for an item side, or null when none is loaded. */
function previewSourceOf(itemKey: string, side: string): SidePreview['source'] | null {
  return findPreview(itemKey, side)?.source ?? null;
}

/** Returns the cached type and mechanics for an item's card, or null when unknown. */
function cardMetaOf(item: ItemForm) {
  return item.cardId ? (cardMetas[item.cardId] ?? null) : null;
}

let cardMetaBatch: string[] = [];
let cardMetaTimer: ReturnType<typeof setTimeout> | null = null;

/** Fetches card metadata in a single batched RPC per tick, cached per cardId. */
function ensureCardMeta(cardId: string) {
  if (!cardId || cardMetas[cardId]) return;
  cardMetaBatch.push(cardId);
  if (cardMetaTimer) return;
  cardMetaTimer = setTimeout(() => {
    cardMetaTimer = null;
    const ids = [...new Set(cardMetaBatch)];
    cardMetaBatch = [];
    void (async () => {
      try {
        const lang = renderLang.value === 'all' ? 'zhs' : renderLang.value;
        const result = await client.hearthstone.announcement.cardMetas({ cardIds: ids, lang });
        for (const id of ids) {
          const meta = result[id];
          if (meta) cardMetas[id] = meta;
        }
      } catch { /* fall back to the minion placeholder when metadata is missing */ }
    })();
  }, 0);
}

/** Searches cards by English/Chinese name or cardId for the CardSearchSelect widget. */
function searchCards(query: string, format?: string) {
  return client.hearthstone.announcement.searchCards({ q: query, format });
}

/** Searches sets by setId or localized name for the SetSearchSelect widget. */
async function searchSets(query: string): Promise<Array<{ setId: string, name: string | null }>> {
  const result = await client.hearthstone.set.list({ q: query, limit: 20 });
  return result.items.map(set => ({
    setId: set.setId,
    name:  set.localization.zhs?.full ?? set.localization.en?.full ?? null,
  }));
}

/** Resolves set display names by exact setId for the SetSearchSelect widget. */
async function resolveSetNames(setIds: string[]): Promise<Array<{ setId: string, name: string | null }>> {
  const result: Array<{ setId: string, name: string | null }> = [];
  for (const setId of setIds) {
    try {
      const set = await client.hearthstone.set.get({ setId });
      result.push({ setId, name: set.localization.zhs?.full ?? set.localization.en?.full ?? null });
    } catch {
      result.push({ setId, name: null });
    }
  }
  return result;
}

interface ResolveWaiter {
  ids:     string[];
  resolve: (rows: ResolvedCardName[]) => void;
}

let resolveBatchIds: string[] = [];
let resolveWaiters: ResolveWaiter[] = [];
let resolveTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Batches cardId→name lookups from many CardSearchSelect rows into one RPC per
 * tick. Without this, each row fires its own resolve call, flooding the runtime
 * when an announcement holds dozens of card items.
 */
function batchedResolveCardNames(cardIds: string[]): Promise<ResolvedCardName[]> {
  return new Promise(res => {
    resolveBatchIds.push(...cardIds);
    resolveWaiters.push({ ids: cardIds, resolve: res });
    if (resolveTimer) return;
    resolveTimer = setTimeout(() => {
      resolveTimer = null;
      const ids = [...new Set(resolveBatchIds)];
      const waiters = resolveWaiters;
      resolveBatchIds = [];
      resolveWaiters = [];
      void (async () => {
        try {
          const rows = await client.hearthstone.announcement.resolveCardNames({ cardIds: ids });
          const byId = new Map(rows.map(r => [r.cardId, r]));
          for (const waiter of waiters) {
            waiter.resolve(waiter.ids.map(id => byId.get(id)).filter((r): r is ResolvedCardName => !!r));
          }
        } catch {
          for (const waiter of waiters) waiter.resolve([]);
        }
      })();
    }, 0);
  });
}

function persistRenderLang() {
  localStorage.setItem(RENDER_LANG_KEY, renderLang.value);
}
watch(renderLang, () => {
  persistRenderLang();
  void loadExistingImages();
});

/** Creates the shared runtime input for one item operation. */
function itemOperationInput(item: ItemForm, langs: Locale[]) {
  return {
    item: {
      itemKey:     item._key, type:        item.type, cardId:      item.cardId, format:      item.format,
      version:     item.version ?? null, lastVersion: item.lastVersion ?? null,
      delta:       item.delta, glow:        item.glow,
    },
    version:     form.version!,
    lastVersion: form.lastVersion ?? null,
    langs,
  };
}

/** Downloads one base64 payload through a temporary browser URL. */
function downloadBase64(base64: string, fileName: string, type: string) {
  const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Renders previews without writing image assets. */
async function handlePreviewItem(index: number) {
  const item = form.items[index];
  if (!item?.cardId || !form.version) return;
  previewingItems[item._key] = true;
  Reflect.deleteProperty(renderErrors, item._key);
  try {
    const lang = renderLang.value === 'all' ? 'zhs' : renderLang.value;
    const result: any = await client.hearthstone.announcement.previewItem(itemOperationInput(item, [lang]));
    const errors: string[] = [];
    const previews: SidePreview[] = [];
    for (const file of result.files ?? []) {
      if (file.error || !file.base64) errors.push(`${file.side}/${file.lang}: ${file.error ?? '预览失败'}`);
      else previews.push({ side: file.side, lang: file.lang, hash: '', category: '', template: '', base64: file.base64, mimeType: 'image/png', source: 'preview' });
    }
    if (previews.length > 0) itemPreviews[item._key] = mergePreviews(itemPreviews[item._key] ?? [], previews);
    if (errors.length > 0) renderErrors[item._key] = errors.join('；');
  } catch (error: any) {
    renderErrors[item._key] = error.message ?? '预览失败';
  } finally {
    Reflect.deleteProperty(previewingItems, item._key);
  }
}

/** Downloads side PNG files or one all-language ZIP archive. */
async function handleDownloadPng(index: number) {
  const item = form.items[index];
  if (!item?.cardId || !form.version) return;
  downloadingItems[item._key] = true;
  try {
    const langs = renderLang.value === 'all' ? [] : [renderLang.value];
    const result: any = await client.hearthstone.announcement.downloadItemImages(itemOperationInput(item, langs));
    if (result.archive) downloadBase64(result.archive.base64, result.archive.fileName, 'application/zip');
    else for (const file of result.files ?? []) downloadBase64(file.base64, file.fileName, 'image/png');
    if (result.errors?.length) renderErrors[item._key] = result.errors.join('；');
  } catch (error: any) {
    renderErrors[item._key] = error.message ?? '下载失败';
  } finally {
    Reflect.deleteProperty(downloadingItems, item._key);
  }
}

/** Copies one side request or downloads an all-language requirements document. */
async function handleRequest(item: ItemForm, side?: string) {
  if (!item.cardId || !form.version) return;
  requestingItems[item._key] = true;
  try {
    const langs = renderLang.value === 'all' ? [] : [renderLang.value];
    const result: any = await client.hearthstone.announcement.getRenderRequests(itemOperationInput(item, langs));
    const errors = (result.entries ?? []).filter((entry: any) => entry.error).map((entry: any) => `${entry.side}/${entry.lang}: ${entry.error}`);
    if (errors.length > 0) renderErrors[item._key] = errors.join('；');
    if (renderLang.value === 'all') {
      const url = URL.createObjectURL(new Blob([JSON.stringify(result.requirements, null, 2)], { type: 'application/json' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${item.cardId}-requests.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } else {
      const entry = result.entries?.find((candidate: any) => candidate.side === side && candidate.request);
      if (!entry?.request) throw new Error(result.entries?.find((candidate: any) => candidate.side === side)?.error ?? '无法构建请求');
      await navigator.clipboard.writeText(JSON.stringify(entry.request, null, 2));
      showToast('请求已复制', '', 'success');
    }
  } catch (error: any) {
    renderErrors[item._key] = error.message ?? '请求生成失败';
  } finally {
    Reflect.deleteProperty(requestingItems, item._key);
  }
}

async function handleRenderItem(index: number) {
  const item = form.items[index];
  if (!item?.cardId || !form.version) return;
  const itemKey = item._key;
  renderingItems[itemKey] = true;
  Reflect.deleteProperty(renderErrors, itemKey);
  try {
    // Persist the current announcement before writing the image.
    if (await saveAnnouncement() == null) return;
    const langs = renderLang.value === 'all' ? [] : [renderLang.value];
    const res: any = await client.hearthstone.announcement.renderItems({
      items: [{
        itemKey, type:        item.type, cardId:      item.cardId, format:      item.format,
        version:     item.version ?? null, lastVersion: item.lastVersion ?? null,
        delta:       item.delta,
        glow:        item.glow,
      }],
      version:     form.version,
      lastVersion: form.lastVersion ?? null,
      langs,
    });
    await applyRenderResults(item, res.results ?? []);
  } catch (e: any) {
    console.error('[render] failed', e);
    renderErrors[itemKey] = e.message || '渲染失败';
  } finally {
    Reflect.deleteProperty(renderingItems, itemKey);
  }
}

/** Handles the "写入缺失/全部图片" button: all-mode confirms first, missing-mode runs directly. */
function handleRenderAll() {
  if (!form.version) return;
  const run = renderAllRun.value;
  if (run && (run.status === 'done' || run.status === 'error')) {
    // Locked on the pressed mode; re-running follows the displayed text.
    if (run.mode === 'all') showRenderAllConfirm.value = true;
    else void runRenderAllFlow('missing');
    return;
  }
  if (run) return; // loading/running — the button is disabled anyway
  if (altHeld.value) showRenderAllConfirm.value = true;
  else void runRenderAllFlow('missing');
}

function confirmRenderAll() {
  showRenderAllConfirm.value = false;
  void runRenderAllFlow('all');
}

/** Runs a bulk render-to-storage task with live (done/total) progress. */
async function runRenderAllFlow(mode: 'missing' | 'all') {
  if (!form.version) return;
  const cardItems = form.items
    .filter(item => (item.type === 'card_change' || item.type === 'card_update') && item.cardId)
    .map(item => ({
      itemKey:     item._key, type:        item.type, cardId:      item.cardId, format:      item.format,
      version:     item.version ?? null, lastVersion: item.lastVersion ?? null,
      delta:       item.delta,
      glow:        item.glow,
    }));
  if (cardItems.length === 0) return;

  // Persist the current announcement before writing images.
  if (await saveAnnouncement() == null) return;

  renderAllRun.value = { mode, done: 0, total: 0, status: 'loading' };
  try {
    const res = await fetch('http://localhost:4318/render/stream', {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify({
        items:       cardItems,
        version:     form.version,
        lastVersion: form.lastVersion ?? null,
        langs:       renderLang.value === 'all' ? [] : [renderLang.value],
        mode,
      }),
    });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop() ?? '';
      for (const part of parts) {
        const line = part.split('\n').find(l => l.startsWith('data: '));
        if (!line) continue;
        const data = JSON.parse(line.slice(6));
        if (data.type === 'total' && renderAllRun.value) {
          renderAllRun.value.total = data.total;
          renderAllRun.value.status = 'running';
        } else if (data.type === 'progress' && renderAllRun.value) {
          renderAllRun.value.done = data.done;
        } else if (data.type === 'end') {
          if (renderAllRun.value) renderAllRun.value.status = 'done';
        } else if (data.type === 'error') {
          showToast('写入失败', data.message, 'error');
          if (renderAllRun.value) renderAllRun.value.status = 'error';
        }
      }
    }
    if (renderAllRun.value && renderAllRun.value.status !== 'error') renderAllRun.value.status = 'done';
    await loadExistingImages();
  } catch (e: any) {
    if (renderAllRun.value) renderAllRun.value.status = 'error';
    showToast('写入失败', e.message ?? String(e), 'error');
  }
}

/** Loads successful render results and preserves previews for failed sides. */
async function applyRenderResults(item: ItemForm, results: any[]) {
  const itemResults = results.filter(result => result.itemKey === item._key);
  const replacements: SidePreview[] = [];
  const errors: string[] = [];
  const template = item.format === 'battlegrounds' ? 'battlegrounds' : 'normal';

  for (const result of itemResults) {
    if (result.error || !result.renderHash) {
      errors.push(`${result.side}/${result.lang}: ${result.error ?? '渲染失败'}`);
      continue;
    }

    // The render wrote the image into the bucket; the <img> loads it via URL,
    // so no base64 round-trip or extra read is needed here.
    replacements.push({
      side:     result.side,
      lang:     result.lang,
      hash:     result.renderHash,
      category: result.category,
      template,
      base64:   '',
      source:   'storage',
    });
  }

  if (replacements.length > 0) {
    itemPreviews[item._key] = mergePreviews(itemPreviews[item._key] ?? [], replacements);
  }

  if (errors.length > 0) renderErrors[item._key] = errors.join('；');
  else Reflect.deleteProperty(renderErrors, item._key);
  renderedItems[item._key] = itemResults.length > 0 && errors.length === 0;
}

const emptyItem = (): ItemForm => ({
  _key:            crypto.randomUUID(), type:            'card_update', effectiveDate:   '', format:          '', status:          'buff',
  group:           '', version:         undefined, lastVersion:     undefined,
  cardId:          '', setId:           '', ruleId:          '', relatedCardsStr: '',
  delta:           null, glow:            null,
  _groupAuto:      true,
});

/** Appends an editable glow marker to a card update item. */
function addGlow(item: ItemForm) {
  item.glow ??= [];
  const used = new Set(item.glow.map(entry => entry.part));
  const part = glowPart.options.find(candidate => !used.has(candidate));
  if (part) item.glow.push({ part, type: 'buff' });
}

/** Item key currently computing glow; empty when idle. */
const glowCalculatingId = ref('');

/**
 * Computes glow for a card_update item by diffing its prev/curr card versions.
 * `silent` suppresses toasts and the button spinner (used for auto-compute on
 * cardId change); `replace` swaps the whole glow instead of merging.
 */
async function computeGlow(item: ItemForm, options: { silent?: boolean, replace?: boolean } = {}) {
  const { silent = false, replace = false } = options;
  if (!item.cardId) return;
  const version = item.version ?? form.version;
  const lastVersion = item.lastVersion ?? form.lastVersion ?? form.version;
  if (version == null || lastVersion == null) {
    if (!silent) showToast('缺少版本信息', '请先选择公告版本', 'error');
    return;
  }
  if (!silent) glowCalculatingId.value = item._key;
  try {
    const glow = await client.hearthstone.announcement.computeCardGlow({
      cardId: item.cardId,
      version,
      lastVersion,
      lang:   renderLang.value === 'all' ? 'zhs' : renderLang.value,
      delta:  item.delta ?? undefined,
    });
    if (glow.length === 0) {
      if (!silent) showToast('未检测到变化');
      return;
    }
    if (replace) item.glow = sortGlowEntries(glow);
    else mergeGlow(item, glow);
    if (item.type === 'card_update' && item.status === 'unknown') {
      item.status = deriveStatusFromGlow(item.glow ?? []);
    }
  } catch (error) {
    if (!silent) showToast('计算高亮失败', error instanceof Error ? error.message : String(error), 'error');
  } finally {
    if (!silent) glowCalculatingId.value = '';
  }
}

const GLOW_PART_ORDER = new Map(glowPart.options.map((part, index) => [part, index]));

function sortGlowEntries(entries: GlowEntry[]) {
  return [...entries].sort(
    (a, b) => (GLOW_PART_ORDER.get(a.part) ?? Number.MAX_SAFE_INTEGER) - (GLOW_PART_ORDER.get(b.part) ?? Number.MAX_SAFE_INTEGER),
  );
}

/** Merges computed glow into the item: overwrites same-part types, keeps untouched parts. */
function mergeGlow(item: ItemForm, computed: GlowEntry[]) {
  const byPart = new Map((item.glow ?? []).map(entry => [entry.part, entry]));
  for (const entry of computed) {
    const existing = byPart.get(entry.part);
    if (existing) existing.type = entry.type;
    else byPart.set(entry.part, { part: entry.part, type: entry.type });
  }
  item.glow = sortGlowEntries([...byPart.values()]);
}

/** Derives an overall status from glow entries for the card_update 'unknown' placeholder. */
function deriveStatusFromGlow(glow: GlowEntry[]): ChangeStatus {
  const types = glow.map(entry => entry.type);
  if (types.every(t => t === 'nerf')) return 'nerf';
  if (types.every(t => t === 'buff')) return 'buff';
  if (types.includes('rework') || types.includes('neutral')) return 'rework';
  return 'tweak';
}

/** Lists fixed glow parts while preventing duplicate selections within an item. */
function glowPartOptions(item: ItemForm, index: number) {
  const used = new Set((item.glow ?? []).filter((_, entryIndex) => entryIndex !== index).map(entry => entry.part));
  return glowPart.options.map(part => ({ label: part, value: part, disabled: used.has(part) }));
}

/** Applies the renderer's selected glow palette to one editor row. */
function glowTypeStyle(type: GlowEntry['type']) {
  const colors = glowTypeColors[type];
  return {
    color:           colors.color,
    borderColor:     colors.hiColor,
    backgroundColor: `${colors.colorize}33`,
  };
}

/** Removes a glow marker and normalizes an empty collection back to null. */
function removeGlow(item: ItemForm, index: number) {
  item.glow?.splice(index, 1);
  if (item.glow?.length === 0) item.glow = null;
}

/** Clears all preview-related state for one form item. */
function clearItemPreviewState(itemKey: string) {
  Reflect.deleteProperty(itemPreviews, itemKey);
  Reflect.deleteProperty(renderingItems, itemKey);
  Reflect.deleteProperty(previewingItems, itemKey);
  Reflect.deleteProperty(downloadingItems, itemKey);
  Reflect.deleteProperty(requestingItems, itemKey);
  Reflect.deleteProperty(renderErrors, itemKey);
  Reflect.deleteProperty(renderedItems, itemKey);
}

/** Clears preview-related state when the active announcement changes. */
function clearPreviewState() {
  for (const itemKey of new Set([
    ...Object.keys(itemPreviews),
    ...Object.keys(renderingItems),
    ...Object.keys(previewingItems),
    ...Object.keys(downloadingItems),
    ...Object.keys(requestingItems),
    ...Object.keys(renderErrors),
    ...Object.keys(renderedItems),
  ])) {
    clearItemPreviewState(itemKey);
  }
}

/** Clears all form items and their transient preview state after confirmation. */
function confirmClearItems() {
  clearPreviewState();
  form.items = [];
  showClearItemsModal.value = false;
}

const form = reactive({
  id:            '', source:        'blizzard', date:          '',
  effectiveDate: '', version:       undefined as number | undefined,
  lastVersion:   undefined as number | undefined, name:          '',
  link:          [] as LinkEntry[], items:         [] as ItemForm[],
});

/** Card items shown in the image-only gallery (only types that render a card image). */
const imageItems = computed(() => form.items.filter(item => expectedSides(item.type).length > 0));

// Resolves placeholder card metadata for items as soon as their cardIds are known.
watch(
  () => form.items.map(item => item.cardId).filter((id): id is string => !!id),
  ids => {
    for (const id of new Set(ids)) void ensureCardMeta(id);
  },
  { immediate: true },
);

// Auto-fills the announcement group from format + card type until it is manually set.
watch(
  () => form.items.map(item => ({
    key:          item._key,
    format:       item.format,
    type:         cardMetaOf(item)?.type ?? null,
    isTimewarped: cardMetaOf(item)?.isTimewarped ?? false,
  })),
  entries => {
    for (const entry of entries) {
      const item = form.items.find(it => it._key === entry.key);
      // Manually-special bg groups not derivable from card type must survive
      // auto-alignment regardless of the _groupAuto flag.
      if (!item || item._groupAuto === false || item.group === 'bg_dm_prize' || item.group === 'bg_buddy') continue;
      const derived = deriveGroup(entry.format, entry.type, entry.isTimewarped);
      if (derived && item.group !== derived) item.group = derived;
    }
  },
  { deep: true },
);

const selectedAnnouncement = computed(() => announcements.value.find(a => a.id === selectedId.value) ?? null);

const sourceOptions = [
  { label: 'Blizzard', value: 'blizzard' },
  { label: '热修', value: 'hotfix' },
  { label: '系列发售', value: 'release' },
];

const sourceLabels: Record<string, string> = {
  'blizzard': 'Blizzard', 'blizzard-cn': '国服', 'release': '系列发售', 'hotfix': '热修',
};

function sourceLabel(source: string): string {
  return sourceLabels[source] ?? source;
}

const itemTypeOptions = [
  { label: 'card_change', value: 'card_change' }, { label: 'card_update', value: 'card_update' },
  { label: 'set_change', value: 'set_change' }, { label: 'rule_change', value: 'rule_change' },
  { label: 'format_birth', value: 'format_birth' }, { label: 'format_death', value: 'format_death' },
];

const formatOptions = [
  { label: '全部格式', value: '__all__' },
  { label: '构筑 constructed', value: 'constructed' },
  { label: '标准 standard', value: 'standard' },
  { label: '狂野 wild', value: 'wild' },
  { label: '战棋 battlegrounds', value: 'battlegrounds' },
  { label: '竞技场 arena', value: 'arena' },
  { label: '幻变 twist', value: 'twist' },
  { label: '佣兵 mercenaries', value: 'mercenaries' },
];

const GROUP_LABELS: Record<string, string> = {
  core_rotation:   '核心系列轮替',
  bg_hero:         '战棋英雄',
  bg_minion:       '战棋随从',
  bg_trinket:      '战棋饰品',
  bg_tavern_spell: '战棋酒馆法术',
  bg_anomaly:      '战棋畸变',
  bg_buddy:        '战棋伙伴',
  bg_timewarped:   '战棋时空扭曲',
  bg_dm_prize:     '战棋暗月奖品',
};

const groupOptions = [
  { label: '无', value: 'none' },
  ...groupEnum.options.map(v => ({ label: GROUP_LABELS[v] ?? v, value: v })),
];

/** Applies a manual group choice, stopping future auto-derivation for the item. */
function handleGroupSelect(item: ItemForm, value: unknown) {
  item.group = value === 'none' ? '' : String(value);
  item._groupAuto = false;
}

/** Status dropdown options for a change type (empty when the type has no status). */
function statusOptionsFor(type: string) {
  const config = changeStatusByType[type as GameChangeType];
  return config ? config.statuses.map(status => ({ label: status, value: status })) : [];
}

/** Switches an item's type, resetting its status to the new type's default when invalid. */
function handleTypeChange(item: ItemForm, value: unknown) {
  const type = String(value);
  if (type === item.type) return;
  item.type = type;
  const config = changeStatusByType[type as GameChangeType];
  if (!config) return;
  if (item.status && !config.statuses.includes(item.status as ChangeStatus)) {
    item.status = config.default ?? 'buff';
  }
}

// ----- Item version / delta editing -----

/** Item key whose version/delta edit modal is open; null when closed. */
const versionEditKey = ref<string | null>(null);
const editVersion = ref<number | 'inherit'>('inherit');
const editLastVersion = ref<number | 'inherit' | 'same'>('inherit');
const editDeltaPrev = ref('');
const editDeltaCurr = ref('');
const editDeltaValid = computed(() => isDeltaSideValid(editDeltaPrev.value) && isDeltaSideValid(editDeltaCurr.value));

const versionEditItem = computed(() => form.items.find(i => i._key === versionEditKey.value) ?? null);
const versionEditModalOpen = computed({
  get: () => versionEditKey.value != null,
  set: (v: boolean) => { if (!v) versionEditKey.value = null; },
});

/** Version dropdown options for an item (inherit the announcement version, or a specific patch). */
const itemVersionOptions = computed(() => [{ label: '继承公告', value: 'inherit' }, ...patchOptions.value]);
/** Last-version dropdown options for an item (inherit, same as its version, or a specific patch). */
const itemLastVersionOptions = computed(() => [
  { label: '继承公告', value: 'inherit' },
  { label: '与版本相同', value: 'same' },
  ...patchOptions.value,
]);

/** Version/delta edit state of an item: none, version override, or delta set. */
function itemEditState(item: ItemForm): 'none' | 'version' | 'delta' {
  if (item.delta && Object.keys(item.delta).length > 0) return 'delta';
  if (item.version != null || item.lastVersion != null) return 'version';
  return 'none';
}

function itemEditColor(item: ItemForm): 'neutral' | 'primary' | 'warning' {
  return itemEditState(item) === 'delta' ? 'warning' : itemEditState(item) === 'version' ? 'primary' : 'neutral';
}

function versionDeltaTooltip(item: ItemForm): string {
  const parts: string[] = [];
  if (item.version != null) parts.push(`版本 ${item.version}`);
  if (item.lastVersion != null) parts.push(`对比 ${item.lastVersion}`);
  if (item.delta && Object.keys(item.delta).length > 0) parts.push('含 delta');
  return parts.join(' · ') || '含修正';
}

/** Opens the version/delta edit modal for one item. */
function openItemVersionDelta(key: string) {
  const item = form.items.find(i => i._key === key);
  if (!item) return;
  editVersion.value = item.version ?? 'inherit';
  editLastVersion.value = item.lastVersion ?? 'inherit';
  editDeltaPrev.value = item.delta?.prev ? stringifyYaml(item.delta.prev) : '';
  editDeltaCurr.value = item.delta?.curr ? stringifyYaml(item.delta.curr) : '';
  versionEditKey.value = key;
}

/** Applies the edited version/lastVersion/delta to the item. */
function applyItemVersionDelta() {
  const item = versionEditItem.value;
  if (!item) return;
  item.version = editVersion.value === 'inherit' ? undefined : editVersion.value;
  if (editLastVersion.value === 'inherit') item.lastVersion = undefined;
  else if (editLastVersion.value === 'same') item.lastVersion = item.version ?? undefined;
  else item.lastVersion = editLastVersion.value;
  if (editDeltaValid.value) {
    const delta: ItemDelta = {};
    const prev = parseDeltaSide(editDeltaPrev.value) as Partial<RenderModel> | null;
    const curr = parseDeltaSide(editDeltaCurr.value) as Partial<RenderModel> | null;
    if (prev) delta.prev = prev;
    if (curr) delta.curr = curr;
    item.delta = Object.keys(delta).length > 0 ? delta : null;
  }
  versionEditKey.value = null;
}

/** Parses one delta side as YAML; null when empty/whitespace (the field is omitted). */
function parseDeltaSide(text: string): unknown | null {
  const t = text.trim();
  if (!t) return null;
  return parseYaml(t);
}

/** True when one delta side's YAML is empty or parses cleanly. */
function isDeltaSideValid(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  try {
    parseYaml(t);
    return true;
  } catch {
    return false;
  }
}

/** Glow parts that only change a numeric stat; a numeric-only change is never a rework. */
const NUMERIC_GLOW_PARTS = new Set(['attack', 'health', 'cost', 'durability', 'armor']);

/** True when a card_update's status direction conflicts with its glow parts. */
function statusGlowConflict(item: ItemForm): boolean {
  if (item.type !== 'card_update') return false;
  const glow = item.glow ?? [];
  if (glow.length === 0) return false;
  const status = item.status;
  if (!status) return false;

  const types = glow.map(entry => entry.type);
  const allNerf = types.every(t => t === 'nerf');
  const allBuff = types.every(t => t === 'buff');

  // A glow that is entirely one direction must not claim the opposite, a tweak, or a rework.
  // A mix that includes a rework/neutral part is left alone (it can justify status "rework").
  if (allNerf && (status === 'buff' || status === 'tweak' || status === 'rework')) return true;
  if (allBuff && (status === 'nerf' || status === 'tweak' || status === 'rework')) return true;

  // A pure numeric adjustment (only numeric parts, all directional) is never a rework.
  // A glow carrying a rework/neutral type is a redesign or wording change, so rework stays valid.
  const allNumericParts = glow.every(entry => NUMERIC_GLOW_PARTS.has(entry.part));
  const allDirectional = types.every(t => t === 'buff' || t === 'nerf');
  if (allNumericParts && allDirectional && status === 'rework') return true;

  return false;
}

/** True when the item carries a status that needs attention (conflict or unresolved 'unknown'). */
function itemHasWarning(item: ItemForm): boolean {
  return item.status === 'unknown' || statusGlowConflict(item);
}

const toast = useToast();

function showToast(title: string, description?: string, color?: 'error' | 'success') {
  toast.add({ title, description, color });
}

function parseRelatedCards(s: string): string[] {
  return s.split(',').map(v => v.trim()).filter(Boolean);
}

function resetForm() {
  clearPreviewState();
  Object.assign(form, {
    id:            '', source:        'blizzard', date:          '',
    effectiveDate: '', version:       undefined, lastVersion:   undefined, name:          '', link:          [], items:         [],
  });
  selectedId.value = null;
  isCreating.value = false;
  mode.value = 'form';
  textErrors.value = [];
  textPendingCount.value = 0;
  // An empty/new form is a resting state: subsequent card picks should refresh.
  hydrated.value = true;
}

function fillForm(row: any) {
  clearPreviewState();
  Object.assign(form, {
    id:            row.id, source:        row.source, date:          row.date,
    effectiveDate: row.effectiveDate ?? '', version:       row.version,
    lastVersion:   row.lastVersion ?? undefined, name:          row.name,
    link:          Array.isArray(row.link) ? row.link : [],
  });
  form.items = (row.items ?? []).map((i: any) => ({
    id:              i.id, _key:            i.id ?? crypto.randomUUID(), type:            i.type ?? 'card_update',
    effectiveDate:   i.effectiveDate ?? '', format:          i.format ?? '', status:          i.status ?? '',
    group:           i.group ?? '',
    version:         i.version, lastVersion:     i.lastVersion,
    cardId:          i.cardId ?? '', setId:           i.setId ?? '', ruleId:          i.ruleId ?? '',
    relatedCardsStr: Array.isArray(i.relatedCards) ? i.relatedCards.join(', ') : '',
    delta:           i.delta ?? null, glow:            i.glow ?? null,
    _groupAuto:      !i.group,
  }));
  isCreating.value = false;
  mode.value = 'form';
  textErrors.value = [];
  textPendingCount.value = 0;
}

function selectAnnouncement(item: any) {
  clearPreviewState();
  selectedId.value = item.id;
  loadDetail(item.id);
}

async function loadDetail(id: string) {
  try {
    const detail: any = await client.hearthstone.announcement.get({ id });
    if (selectedId.value !== id) return;
    fillForm(detail);
    await loadExistingImages();
    // Initial hydration done; from here on, cardId edits refresh their own image.
    hydrated.value = true;
  } catch (e: any) { showToast('加载详情失败', e.message, 'error'); }
}

async function loadExistingImages() {
  if (!form.version) return;
  const cardItems = form.items.filter(i =>
    (i.type === 'card_change' || i.type === 'card_update') && i.cardId,
  );
  if (cardItems.length === 0) return;

  try {
    const res: any = await client.hearthstone.announcement.getItemImages({
      items: cardItems.map(item => ({
        itemKey:     item._key, type:        item.type, cardId:      item.cardId, format:      item.format,
        version:     item.version ?? null, lastVersion: item.lastVersion ?? null,
        delta:       item.delta,
        glow:        item.glow,
      })),
      version:     form.version,
      lastVersion: form.lastVersion ?? null,
      langs:       renderLang.value === 'all' ? [] : [renderLang.value],
    });

    for (const item of form.items) {
      if (!item?.cardId) continue;
      const images = (res.images ?? []).filter((img: any) => img.itemKey === item._key && img.hash);
      if (images.length === 0) continue;

      itemPreviews[item._key] = images.map((img: any) => ({
        side: img.side, lang: img.lang, hash: img.hash, category: img.category, template: img.template, base64: '', source: 'storage',
      }));
      renderedItems[item._key] = true;
    }
  } catch { /* silently skip if images not available */ }
}

/** Clears stale previews and re-fetches the stored images for one item (used on cardId change). */
async function refreshItemImage(item: ItemForm) {
  clearItemPreviewState(item._key);
  if (!item.cardId || !form.version) return; // cleared card → placeholder
  try {
    const res: any = await client.hearthstone.announcement.getItemImages({
      items: [{
        itemKey:     item._key, type:        item.type, cardId:      item.cardId, format:      item.format,
        version:     item.version ?? null, lastVersion: item.lastVersion ?? null,
        delta:       item.delta,
        glow:        item.glow,
      }],
      version:     form.version,
      lastVersion: form.lastVersion ?? null,
      langs:       renderLang.value === 'all' ? [] : [renderLang.value],
    });
    const images = (res.images ?? []).filter((img: any) => img.itemKey === item._key && img.hash);
    if (images.length === 0) return; // no stored image for the new card yet; show placeholder
    itemPreviews[item._key] = images.map((img: any) => ({
      side: img.side, lang: img.lang, hash: img.hash, category: img.category, template: img.template, base64: '', source: 'storage',
    }));
    renderedItems[item._key] = true;
  } catch { /* silently skip if images not available */ }
}

// Refresh the rendered preview whenever a cardId changes, but skip the initial
// hydration pass (loadExistingImages already covers it).
watch(() => form.items.map(item => [item._key, item.cardId] as const), (pairs, prevPairs) => {
  if (!hydrated.value) return;
  const prev = new Map(prevPairs ?? []);
  for (const [key, cardId] of pairs) {
    if (prev.get(key) !== cardId) {
      const item = form.items.find(i => i._key === key);
      if (item) void handleItemCardIdChanged(item);
    }
  }
});

/** Runs when an item's cardId changes: auto-compute glow only when uncomputed, then refresh the stored image. */
async function handleItemCardIdChanged(item: ItemForm) {
  // Auto-compute only for items that have no glow yet, so manually adjusted glow survives
  // bulk triggers (e.g. reload after saving a new announcement rekeys every item).
  if (item.type === 'card_update' && item.cardId && (item.glow == null || item.glow.length === 0)) {
    await computeGlow(item, { silent: true, replace: true });
  }
  await refreshItemImage(item);
}

function createNew() {
  resetForm();
  isCreating.value = true;
}

function addLink() {
  form.link.push({ url: '', label: '' });
}

const AUTO_LABELS: Record<string, string> = {
  'playhearthstone.com':      'blizzard',
  'hearthstone.blizzard.com': 'blizzard',
  'forums.blizzard.com':      'blizzard',
  'hs.blizzard.cn':           'blizzard-cn',
};

function deriveLabel(url: string): string | null {
  try {
    const host = new URL(url).hostname;
    for (const [domain, label] of Object.entries(AUTO_LABELS)) {
      if (host === domain || host.endsWith(`.${domain}`)) return label;
    }
  } catch { /* not a valid URL yet */ }
  return null;
}

function handleUrlChange(link: LinkEntry, url: string | number) {
  const derived = deriveLabel(String(url));
  if (!derived) return;
  if (!link.label || Object.values(AUTO_LABELS).includes(link.label)) {
    link.label = derived;
  }
}

async function handleCrawl() {
  crawling.value = true;
  try {
    const result: any = await client.hearthstone.announcement.crawlLinks({});

    resetForm();
    isCreating.value = true;

    form.name = result.name ?? '';
    form.date = result.date || new Date().toISOString().split('T')[0]!;
    form.link = (result.links ?? []).map((l: any) => ({ url: l.url, label: l.label }));
  } catch (e: any) {
    showToast('获取失败', e.message, 'error');
  } finally { crawling.value = false; }
}

function removeLink(i: number) {
  form.link.splice(i, 1);
}

/** Appends a new item inheriting type/format/status from the previous one, if any. */
function addItem() {
  const last = form.items[form.items.length - 1];
  const item = {
    ...emptyItem(),
    type:   last?.type ?? 'card_update',
    format: last?.format ?? '',
    status: last?.status ?? 'buff',
  };
  form.items.push(item);
  // Auto-expand the newly added item so it is immediately editable.
  expandedKey.value = item._key;
}

/** Inserts a new item after the given one, inheriting its type/format/status. */
function addItemAfter(index: number) {
  const current = form.items[index];
  const item = {
    ...emptyItem(),
    type:   current?.type ?? 'card_update',
    format: current?.format ?? '',
    status: current?.status ?? 'buff',
  };
  form.items.splice(index + 1, 0, item);
  // Auto-expand the newly added item so it is immediately editable.
  expandedKey.value = item._key;
}

function removeItem(i: number) {
  const item = form.items[i];
  if (item) clearItemPreviewState(item._key);
  form.items.splice(i, 1);
}

function moveItem(from: number, direction: -1 | 1) {
  const to = from + direction;
  if (to < 0 || to >= form.items.length) return;
  const item = form.items.splice(from, 1)[0]!;
  form.items.splice(to, 0, item);
}

/** Converts a form item to the text-mode representation (entity ids stay as cardId). */
function toTextItem(item: ItemForm): TextItem {
  return {
    type:          item.type,
    effectiveDate: item.effectiveDate,
    format:        item.format,
    status:        item.status,
    group:         item.group,
    version:       item.version,
    lastVersion:   item.lastVersion,
    cardId:        item.cardId,
    setId:         item.setId,
    ruleId:        item.ruleId,
    relatedCards:  parseRelatedCards(item.relatedCardsStr),
    delta:         item.delta as Record<string, unknown> | null,
    glow:          item.glow,
  };
}

/** Searches cards for text-mode name resolution with a larger candidate window. */
function textSearch(name: string, format: string) {
  return client.hearthstone.announcement.searchCards({ q: name, limit: 50, format });
}

/** Whether two items carry the same meaningful content (previews are only valid when equal). */
function sameItem(a: ItemForm, b: ItemForm): boolean {
  return a.type === b.type
    && a.effectiveDate === b.effectiveDate
    && a.format === b.format
    && a.status === b.status
    && a.group === b.group
    && a.version === b.version
    && a.lastVersion === b.lastVersion
    && a.cardId === b.cardId
    && a.setId === b.setId
    && a.ruleId === b.ruleId
    && a.relatedCardsStr === b.relatedCardsStr
    && JSON.stringify(a.delta) === JSON.stringify(b.delta)
    && JSON.stringify(a.glow) === JSON.stringify(b.glow);
}

/** Maps parsed text items back to form items, reusing _keys for unchanged identities. */
function mapParsedToForm(parsedItems: TextItem[]): ItemForm[] {
  const used = new Set<string>();
  const byIdentity = new Map<string, ItemForm>();
  for (const item of form.items) {
    const identity = `${item.type}|${item.cardId}|${item.setId}|${item.ruleId}`;
    if (!byIdentity.has(identity)) byIdentity.set(identity, item);
  }
  return parsedItems.map(parsed => {
    const identity = `${parsed.type}|${parsed.cardId}|${parsed.setId}|${parsed.ruleId}`;
    const prev = !used.has(identity) ? byIdentity.get(identity) : undefined;
    if (prev) used.add(identity);
    return {
      id:              prev?.id,
      _key:            prev?._key ?? crypto.randomUUID(),
      type:            parsed.type,
      effectiveDate:   parsed.effectiveDate,
      format:          parsed.format,
      status:          parsed.status,
      group:           parsed.group,
      version:         parsed.version,
      lastVersion:     parsed.lastVersion,
      cardId:          parsed.cardId,
      setId:           parsed.setId,
      ruleId:          parsed.ruleId,
      relatedCardsStr: parsed.relatedCards.join(', '),
      delta:           parsed.delta as ItemDelta | null,
      glow:            parsed.glow as GlowEntry[] | null,
      _groupAuto:      parsed.group === '',
    };
  });
}

/** Applies live text-mode parse results to the form, clearing previews of changed items. */
function handleTextParsed(result: ParsedResult) {
  textErrors.value = result.errors;
  textPendingCount.value = result.searches.length;
  const next = mapParsedToForm(result.items);
  const nextByKey = new Map(next.map(item => [item._key, item]));
  for (const old of form.items) {
    const kept = nextByKey.get(old._key);
    if (!kept || !sameItem(old, kept)) clearItemPreviewState(old._key);
  }
  form.items = next;
}

/** True when leaving text mode is safe (nothing pending, or the user confirms). */
function canLeaveTextMode(): boolean {
  if (textErrors.value.length === 0 && textPendingCount.value === 0) return true;
  const detail = textPendingCount.value > 0
    ? `${textPendingCount.value} 个 cardId 搜索未完成`
    : '当前文本存在错误';
  return confirm(`退出文本模式将丢弃：${detail}，且条目列表回退到上次有效状态。确定退出？`);
}

/** Switches the editor view; serializes items when entering text, reloads images when needed. */
function setEditorMode(value: unknown) {
  const next = value as EditorMode;
  if (next === mode.value) return;
  // Leaving text mode with pending work requires confirmation.
  if (mode.value === 'text' && next !== 'text' && !canLeaveTextMode()) return;
  const wasText = mode.value === 'text';
  if (next === 'text' && !wasText) {
    yamlText.value = serializeItems(form.items.map(toTextItem));
  }
  mode.value = next;
  // Text-mode live sync clears previews; reload stored images when leaving text or entering image.
  if (next === 'image' || (next === 'form' && wasText)) void loadExistingImages();
}

/** Switches to form mode and expands the given item for immediate editing. */
function jumpToItem(item: ItemForm) {
  setEditorMode('form');
  expandedKey.value = item._key;
}

/** Opens the batch-insert modal using the given item as the config template. */
function openBatchInsert(item: ItemForm) {
  batchInsertIndex.value = form.items.indexOf(item);
  batchNames.value = '';
  batchResolved.value = [];
  batchInsertOpen.value = true;
}

/** Builds a new item that clones the template's config but targets one card or set. */
function batchItemFrom(template: ItemForm, id: string): ItemForm {
  const isSet = idKindOf(template.type) === 'set';
  return {
    ...emptyItem(),
    type:          template.type,
    status:        template.status,
    format:        template.format,
    group:         template.group,
    version:       template.version,
    lastVersion:   template.lastVersion,
    effectiveDate: template.effectiveDate,
    cardId:        isSet ? '' : id,
    setId:         isSet ? id : '',
    _groupAuto:    template._groupAuto,
  };
}

/** Resolves the pasted names into a selectable candidate preview; nothing is inserted yet. */
async function resolveBatchNames() {
  const index = batchInsertIndex.value;
  const template = index >= 0 ? form.items[index] : null;
  if (!template) return;
  const names = batchNames.value.split('\n').map(name => name.trim()).filter(Boolean);
  batchResolving.value = true;
  try {
    const rows: BatchResolvedItem[] = [];
    for (const name of names) {
      if (batchKind.value === 'set') {
        const result = await client.hearthstone.set.list({ q: name, limit: 50 });
        const candidates: BatchCandidate[] = result.items.map(set => ({
          id:    set.setId,
          label: set.localization.zhs?.full ?? set.localization.en?.full ?? set.setId,
        }));
        rows.push({ name, candidates, selected: candidates[0]?.id ?? '' });
      } else {
        const matches = await searchCards(name, template.format || undefined);
        const candidates: BatchCandidate[] = matches.map(card => ({
          id:    card.cardId,
          label: card.nameZh ?? card.nameEn ?? card.cardId,
        }));
        rows.push({ name, candidates, selected: candidates[0]?.id ?? '' });
      }
    }
    batchResolved.value = rows;
  } finally {
    batchResolving.value = false;
  }
}

/** Inserts the rows confirmed in the modal after the template item. */
async function confirmBatchInsert() {
  const index = batchInsertIndex.value;
  const template = index >= 0 ? form.items[index] : null;
  if (!template) return;
  const selected = batchResolved.value
    .map(row => row.selected)
    .filter((id): id is string => !!id);
  if (selected.length === 0) return;
  const isSet = idKindOf(template.type) === 'set';
  batchInserting.value = true;
  try {
    // The template itself fills the first selected id when it has none.
    const newItems: ItemForm[] = [];
    if (isSet ? !template.setId : !template.cardId) {
      if (isSet) template.setId = selected[0]!;
      else template.cardId = selected[0]!;
      for (const id of selected.slice(1)) newItems.push(batchItemFrom(template, id));
    } else {
      for (const id of selected) newItems.push(batchItemFrom(template, id));
    }
    if (newItems.length > 0) form.items.splice(index + 1, 0, ...newItems);
    const skipped = batchResolved.value.filter(row => !row.selected).length;
    showToast(`已插入 ${selected.length} 条${skipped > 0 ? `，跳过 ${skipped} 条` : ''}`, '', 'success');
    batchInsertOpen.value = false;
    batchResolved.value = [];
    batchNames.value = '';
  } finally {
    batchInserting.value = false;
  }
}

function openSortModal() {
  sortSnapshot.value = form.items.slice();
  for (const item of form.items) {
    if (item.cardId) void ensureCardMeta(item.cardId);
  }
  sortModalOpen.value = true;
}

function cancelSort() {
  form.items = sortSnapshot.value.slice();
  sortModalOpen.value = false;
}

// Distinct tile tint and type pill colors per change type.
const typeColors: Record<string, { pill: string, tile: string }> = {
  card_change:  { pill: 'bg-blue-100 text-blue-600', tile: 'bg-blue-50' },
  card_update:  { pill: 'bg-amber-100 text-amber-600', tile: 'bg-amber-50' },
  set_change:   { pill: 'bg-violet-100 text-violet-600', tile: 'bg-violet-50' },
  rule_change:  { pill: 'bg-rose-100 text-rose-600', tile: 'bg-rose-50' },
  format_birth: { pill: 'bg-emerald-100 text-emerald-600', tile: 'bg-emerald-50' },
  format_death: { pill: 'bg-slate-100 text-slate-500', tile: 'bg-slate-50' },
};
const defaultTypeColor = { pill: 'bg-slate-100 text-slate-500', tile: 'bg-white' };

/** Returns the pill and tile color classes for an item's change type. */
function typeColor(type: string) {
  return typeColors[type] ?? defaultTypeColor;
}

function tileTitle(item: ItemForm): string {
  const name = item.cardId ? cardMetas[item.cardId]?.name : null;
  if (name) return name;
  return item.cardId || item.setId || item.ruleId || item.type || '未命名条目';
}

function tileMeta(item: ItemForm): string {
  const parts = [item.status, item.format, item.group];
  return parts.filter(Boolean).join(' · ') || '暂无标识';
}

function groupLabel(group: string): string {
  return GROUP_LABELS[group] ?? group;
}

/** Toggles an item's expanded editor; accordion-style (single expanded). */
function toggleItemExpand(key: string) {
  expandedKey.value = expandedKey.value === key ? '' : key;
}

/** Opens the streaming AI parse panel for one link and keeps the link marked as parsing. */
function handleAiParse(index: number) {
  const link = form.link[index];
  if (!link?.url) return;
  if (!aiConfigured.value) {
    showToast('AI 未配置', '请在设置中配置 API Key', 'error');
    return;
  }

  // If another link is already parsing, clear its flag before switching panels.
  if (parseLinkIndex.value != null && parseLinkIndex.value !== index) {
    const prev = form.link[parseLinkIndex.value];
    if (prev) prev._parsing = false;
  }

  parseLinkIndex.value = index;
  link._parsing = true;
}

/** Applies the parsed header and items into the form. */
function applyParseResult(result: { header: any, items: any[] }) {
  const header = result.header ?? {};
  if (!form.name && header.name) form.name = header.name;
  if (!form.date && header.date) form.date = header.date;
  if (!form.effectiveDate && header.effectiveDate) form.effectiveDate = header.effectiveDate;
  if (form.version == null && header.version != null) form.version = header.version;

  const items: ItemForm[] = (result.items ?? []).map((i: any) => ({
    _key:            crypto.randomUUID(), type:            i.type ?? 'card_update', format:          i.format ?? '',
    status:          i.status ?? '', group:           i.group ?? '',
    cardId:          i.cardId ?? '', setId:           i.setId ?? '', ruleId:          i.ruleId ?? '',
    effectiveDate:   '', version:         undefined, lastVersion:     undefined,
    relatedCardsStr: Array.isArray(i.relatedCards) ? i.relatedCards.join(', ') : '',
    delta:           i.delta ?? null, glow:            i.glow ?? null,
  }));
  form.items = [...form.items, ...items];
  showToast('AI 解析完成', `新增 ${items.length} 条条目`, 'success');
}

/** Clears the parsing flag once the stream settles (result or error). */
function onParseSettled() {
  const link = form.link[parseLinkIndex.value ?? -1];
  if (link) link._parsing = false;
}

/** Closes the streaming panel and clears the link parsing flag. */
function closeParsePanel(index: number) {
  parseLinkIndex.value = null;
  const link = form.link[index];
  if (link) link._parsing = false;
}

async function loadAnnouncements() {
  loading.value = true;
  try {
    announcements.value = (await client.hearthstone.announcement.list({})) as any[];
  } catch (e: any) {
    showToast('加载失败', e.message, 'error');
  } finally {
    loading.value = false;
  }
}

/** Serializes the current form into the announcement save payload. */
function buildPayload() {
  return {
    source:        form.source, date:          form.date, effectiveDate: form.effectiveDate || null,
    version:       form.version!, lastVersion:   form.lastVersion ?? null, name:          form.name.trim(),
    link:          form.link.filter(l => l.url),
    items:         form.items.map(item => {
      const kind = idKindOf(item.type);
      return {
        type:          item.type, effectiveDate: item.effectiveDate || null,
        format:        item.format || null, status:        item.status || null,
        group:         item.group || null, version:       item.version ?? null, lastVersion:   item.lastVersion ?? null,
        cardId:        kind === 'card' ? item.cardId || null : null,
        setId:         kind === 'set' ? item.setId || null : null,
        ruleId:        kind === 'rule' ? item.ruleId || null : null,
        relatedCards:  kind === 'card' ? parseRelatedCards(item.relatedCardsStr) : [],
        delta:         item.delta, glow:          item.glow,
      };
    }),
  };
}

/**
 * Persists the current form (create or update) and returns the announcement id.
 * Returns null when the form is invalid, so callers (save button, render flows)
 * can abort before proceeding.
 */
async function saveAnnouncement(): Promise<string | null> {
  if (saving.value) return form.id ?? null;
  saving.value = true;
  try {
    if (!form.name.trim()) {
      showToast('名称不能为空', '', 'error');
      return null;
    }
    if (!form.date) {
      showToast('日期不能为空', '', 'error');
      return null;
    }
    if (form.version == null) {
      showToast('版本不能为空', '', 'error');
      return null;
    }

    const payload = buildPayload();
    if (isCreating.value) {
      const created = await client.hearthstone.announcement.create(payload);
      form.id = created.id;
      isCreating.value = false;
      return created.id;
    }
    if (form.id) {
      await client.hearthstone.announcement.update({ id: form.id, ...payload });
      return form.id;
    }
    return null;
  } finally {
    saving.value = false;
  }
}

/** Scoped pool key of an item: (format, group); set pools ignore group. */
function poolScopeKey(item: ItemForm): string {
  const group = item.type === 'set_change' ? '' : item.group;
  return `${item.format}|${group}`;
}

/** True when an item is a pool-rotation full marker (`#full`). */
function isPoolClearItem(item: ItemForm): boolean {
  return (item.type === 'set_change' && isPoolFull(item.setId))
    || (item.type === 'card_change' && isPoolFull(item.cardId));
}

/** Validates pool-rotation usage across items; returns warning messages. */
function validatePoolRotations(items: ItemForm[]): string[] {
  const warnings: string[] = [];
  const rotationScopes = new Set<string>();
  for (const item of items) {
    if (isPoolClearItem(item)) rotationScopes.add(poolScopeKey(item));
  }

  const seenClear = new Set<string>();
  items.forEach((item, index) => {
    if (isPoolClearItem(item)) {
      if (!item.format) warnings.push(`条目 ${index + 1}：#full 缺少 format`);
      if (item.status !== 'unavailable') {
        warnings.push(`条目 ${index + 1}：#full 的 status 必须为 unavailable`);
      }
      if (item.type === 'card_change' && !item.group) {
        warnings.push(`条目 ${index + 1}：card_change 的 #full 必须带 group`);
      }
      if (!item.format) return;
      const scope = poolScopeKey(item);
      if (seenClear.has(scope)) warnings.push(`条目 ${index + 1}：同一池子出现多次 #full`);
      else seenClear.add(scope);
    } else if ((item.type === 'set_change' || item.type === 'card_change') && item.format) {
      const scope = poolScopeKey(item);
      if (rotationScopes.has(scope) && !seenClear.has(scope)) {
        warnings.push(`条目 ${index + 1}：${item.type} 出现在 #full 之前`);
      }
    }
  });
  return warnings;
}

/** Warns when a card_update delta sets a curr-side cardId (it is ignored). */
function validateCurrCardId(items: ItemForm[]): string[] {
  const warnings: string[] = [];
  items.forEach((item, index) => {
    if (item.type === 'card_update' && item.delta?.curr?.cardId) {
      warnings.push(`条目 ${index + 1}：delta.curr.cardId 会被忽略（当前卡为条目 cardId）`);
    }
  });
  return warnings;
}

async function handleSubmit() {
  // Pool-rotation usage and curr-cardId overrides are checked before saving.
  const warnings = [...validatePoolRotations(form.items), ...validateCurrCardId(form.items)];
  if (warnings.length > 0 && !confirm(`公告校验警告：\n${warnings.join('\n')}\n\n仍要保存吗？`)) {
    return;
  }
  // Save the editor mode and the expanded item so they survive the reload.
  const prevMode = mode.value;
  const expandedIndex = expandedKey.value
    ? form.items.findIndex(item => item._key === expandedKey.value)
    : -1;
  try {
    const nextId = await saveAnnouncement();
    if (nextId == null) return;
    showToast('保存成功', '', 'success');
    await loadAnnouncements();
    // Keep the saved announcement selected so the editor stays on it after saving.
    selectedId.value = nextId;
    isCreating.value = false;
    await loadDetail(nextId);
    // Restore the editor mode (and re-serialize text when applicable).
    setEditorMode(prevMode);
    // Items keep their order after reload, so re-expand the saved index.
    if (expandedIndex >= 0 && form.items[expandedIndex]) {
      expandedKey.value = form.items[expandedIndex]._key;
    }
  } catch (e: any) {
    showToast('保存失败', e.message, 'error');
  }
}

async function handleProject() {
  if (!form.id) return;
  projecting.value = true;
  try {
    await client.hearthstone.announcement.project({ announcementId: form.id });
    showToast('投影完成', '', 'success');
    await loadDetail(form.id);
  } catch (e: any) {
    showToast('投影失败', e.message, 'error');
  } finally {
    projecting.value = false;
  }
}

function confirmDelete(item: any) {
  if (confirm(`确定要删除公告"${item.name}"吗？`)) handleDelete(item);
}
async function handleDelete(item: any) {
  try {
    await client.hearthstone.announcement.remove({ id: item.id });
    showToast('删除成功', '', 'success');
    if (selectedId.value === item.id) resetForm();
    await loadAnnouncements();
  } catch (e: any) { showToast('删除失败', e.message, 'error'); }
}

onMounted(async () => {
  await loadAnnouncements();
  try {
    const [health, patchList]: any[] = await Promise.all([
      client.runtime.health(),
      (client.hearthstone.announcement as any).patches(),
    ]);
    aiConfigured.value = !!health.aiConfigured;
    patches.value = patchList ?? [];
    if (patchList?.length > 0) form.version = patchList[0].buildNumber;
  } catch { /* ignore */ }
});

// Option/Alt key tracking: switches the "写入缺失/全部图片" button while held.
function onAltKey(e: KeyboardEvent) {
  const held = e.type === 'keydown';
  if (e.key === 'Alt' && altHeld.value !== held) altHeld.value = held;
}
function onWindowBlur() {
  if (altHeld.value) altHeld.value = false;
}

// A finished task stays locked to its pressed mode until the user changes alt.
watch(altHeld, () => {
  const run = renderAllRun.value;
  if (run && (run.status === 'done' || run.status === 'error')) renderAllRun.value = null;
});

onMounted(() => {
  window.addEventListener('keydown', onAltKey);
  window.addEventListener('keyup', onAltKey);
  window.addEventListener('blur', onWindowBlur);
});
onUnmounted(() => {
  window.removeEventListener('keydown', onAltKey);
  window.removeEventListener('keyup', onAltKey);
  window.removeEventListener('blur', onWindowBlur);
});
</script>
