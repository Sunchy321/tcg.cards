<script setup lang="ts">
import { useToast } from '@nuxt/ui/composables';
import { useDesktopRuntimeClient } from '~/composables/useDesktopRuntimeClient';
import { getConsoleErrorMessage } from '@tcg-cards/console-core';

definePageMeta({
  layout: 'admin',
  title: '版本管理',
});

interface PatchRow {
  buildNumber: number;
  name: string;
  shortName: string;
  hash: string;
  releaseDate: string | null;
}

const toast = useToast();
const client = useDesktopRuntimeClient();

const loading = ref(false);
const syncing = ref(false);
const items = ref<PatchRow[]>([]);
const selectedPatch = ref<PatchRow | null>(null);
const filters = reactive({ q: '' });
const page = ref(1);
const pageSize = 50;

const total = computed(() => items.value.length);
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)));

const pagedItems = computed(() => {
  let filtered = items.value;
  if (filters.q) {
    const q = filters.q.toLowerCase();
    filtered = filtered.filter(p =>
      String(p.buildNumber).includes(q) ||
      p.name.toLowerCase().includes(q) ||
      p.shortName.toLowerCase().includes(q),
    );
  }
  const start = (page.value - 1) * pageSize;
  return filtered.slice(start, start + pageSize);
});

function selectPatch(buildNumber: number) {
  selectedPatch.value = items.value.find(p => p.buildNumber === buildNumber) ?? null;
}

function resetFilters() {
  filters.q = '';
  page.value = 1;
}

async function loadPatches() {
  loading.value = true;
  try {
    const data = await (client.hearthstone as any).announcement.patches() as PatchRow[];
    items.value = (data ?? []).sort((a, b) => b.buildNumber - a.buildNumber);
    if (selectedPatch.value && !items.value.find(p => p.buildNumber === selectedPatch.value!.buildNumber)) {
      selectedPatch.value = null;
    }
  } catch (error) {
    toast.add({ title: '加载失败', description: getConsoleErrorMessage(error), color: 'error' });
  } finally {
    loading.value = false;
  }
}

async function syncPatches() {
  syncing.value = true;
  try {
    const result = await client.hsdata.syncPatches() as { count: number };
    toast.add({ title: '同步完成', description: `已同步 ${result.count} 个 patch`, color: 'success' });
    await loadPatches();
  } catch (error) {
    toast.add({ title: '同步失败', description: getConsoleErrorMessage(error), color: 'error' });
  } finally {
    syncing.value = false;
  }
}

function formatBuildDate(date: string | null): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

onMounted(() => {
  loadPatches();
});
</script>

<template>
  <div class="desktop-page h-full space-y-4 overflow-y-auto p-4">
    <div class="rounded-xl border border-slate-200 bg-white p-4">
      <div class="flex items-center gap-6">
        <div>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-git-branch" class="size-5 text-primary" />
            <h1 class="text-xl font-semibold">版本管理</h1>
          </div>
          <p class="mt-1 text-sm text-muted">管理 Hearthstone 补丁版本信息，同步远端 patches 元数据。</p>
        </div>
        <div class="ml-auto hidden items-center gap-6 sm:flex">
          <div class="text-right">
            <div class="text-xs text-muted">补丁数量</div>
            <div class="text-sm font-semibold">{{ total }}</div>
          </div>
          <div class="text-right">
            <div class="text-xs text-muted">最新 Build</div>
            <div class="text-sm font-semibold">{{ items[0]?.buildNumber ?? '—' }}</div>
          </div>
          <div class="max-w-48 text-right">
            <div class="text-xs text-muted">最新补丁</div>
            <div class="truncate text-sm font-semibold">{{ items[0]?.name ?? '—' }}</div>
          </div>
        </div>
        <div class="flex gap-2">
          <UButton
            label="同步 Patches"
            icon="i-lucide-cloud-sync"
            color="primary"
            variant="soft"
            :loading="syncing"
            @click="syncPatches"
          />
          <UButton
            label="刷新"
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="ghost"
            :loading="loading"
            @click="loadPatches"
          />
        </div>
      </div>
    </div>

    <div class="grid gap-4 xl:grid-cols-[minmax(0,460px)_1fr]">
      <div class="space-y-4">
        <div class="rounded-xl border border-slate-200 bg-white p-4">
          <div class="mb-3 font-medium text-slate-700">筛选</div>
          <div class="space-y-3">
            <UInput
              v-model="filters.q"
              icon="i-lucide-search"
              placeholder="搜索 buildNumber / name / shortName"
              class="w-full"
            />
            <div class="flex justify-end gap-2">
              <UButton label="清空" color="neutral" variant="ghost" @click="resetFilters" />
            </div>
          </div>
        </div>

        <div class="rounded-xl border border-slate-200 bg-white">
          <div class="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div>
              <div class="font-medium text-slate-700">Patch 列表</div>
              <p class="text-xs text-slate-400">共 {{ total }} 条，第 {{ page }} / {{ totalPages }} 页</p>
            </div>
            <div class="flex items-center gap-2">
              <UButton icon="i-lucide-chevron-left" color="neutral" variant="ghost" size="xs" :disabled="page <= 1" @click="page -= 1" />
              <UButton icon="i-lucide-chevron-right" color="neutral" variant="ghost" size="xs" :disabled="page >= totalPages" @click="page += 1" />
              <UBadge :label="`${pagedItems.length} 条`" color="neutral" variant="soft" />
            </div>
          </div>

          <div v-if="loading && items.length === 0" class="flex justify-center py-10">
            <UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-slate-400" />
          </div>
          <div v-else-if="pagedItems.length === 0" class="py-10 text-center text-sm text-slate-400">没有匹配的 Patch</div>
          <div v-else class="max-h-144 space-y-2 overflow-y-auto p-2">
            <button
              v-for="patch in pagedItems"
              :key="patch.buildNumber"
              type="button"
              class="w-full rounded-lg border p-3 text-left transition"
              :class="selectedPatch?.buildNumber === patch.buildNumber ? 'border-primary-400 bg-primary-50' : 'border-slate-200 hover:border-primary-200 hover:bg-slate-50'"
              @click="selectPatch(patch.buildNumber)"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="font-mono text-sm font-medium">{{ patch.buildNumber }}</span>
                    <span class="truncate text-sm text-slate-600">{{ patch.name }}</span>
                  </div>
                  <div class="mt-1 flex items-center gap-2 text-xs text-slate-400">
                    <span class="font-mono">{{ patch.shortName }}</span>
                    <span v-if="patch.releaseDate">{{ formatBuildDate(patch.releaseDate) }}</span>
                  </div>
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>

      <div v-if="selectedPatch" class="rounded-xl border border-slate-200 bg-white p-6">
        <div class="mb-4 flex items-center gap-2">
          <UIcon name="i-lucide-git-branch" class="size-5 text-primary" />
          <h2 class="text-lg font-semibold">Patch 详情</h2>
        </div>
        <div class="space-y-4">
          <UFormField label="Build Number">
            <p class="font-mono text-lg">{{ selectedPatch.buildNumber }}</p>
          </UFormField>
          <UFormField label="名称">
            <p class="font-mono text-sm">{{ selectedPatch.name }}</p>
          </UFormField>
          <UFormField label="短名">
            <p class="font-mono text-sm">{{ selectedPatch.shortName }}</p>
          </UFormField>
          <UFormField label="发布日期">
            <p class="text-sm">{{ formatBuildDate(selectedPatch.releaseDate) }}</p>
          </UFormField>
          <UFormField label="Hash">
            <p class="break-all font-mono text-xs text-slate-500">{{ selectedPatch.hash }}</p>
          </UFormField>
        </div>
      </div>
      <div v-else class="flex items-center justify-center rounded-xl border border-slate-200 bg-white p-6">
        <p class="text-sm text-slate-400">选择左侧 Patch 查看详情</p>
      </div>
    </div>
  </div>
</template>
