<template>
  <div class="desktop-page">
    <div class="space-y-6">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 class="desktop-section-title">
            发布配置
          </h1>
          <p class="mt-2 text-sm text-muted">
            配置远端发布目标与环境。当前 `publishTarget` 收束为游戏 ID。
          </p>
        </div>

        <DesktopConfigHeaderActions />
      </div>

      <div class="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <DesktopSettingsSidebar />

        <UCard>
          <template #header>
            <div>
              <div class="font-medium">发布目标</div>
              <div class="mt-1 text-xs text-muted">维护远端发布目标与环境草稿。当前 `publishTarget` 请填写游戏 ID。</div>
            </div>
          </template>

          <div class="space-y-4">
            <div class="flex flex-wrap justify-end gap-2">
              <UButton
                label="新增行"
                icon="i-lucide-plus"
                color="primary"
                variant="soft"
                @click="addDraftTarget"
              />
              <UButton
                label="保存"
                icon="i-lucide-save"
                color="primary"
                :loading="savingTargets"
                :disabled="loadingTargets"
                @click="saveTargets"
              />
              <UButton
                label="刷新"
                icon="i-lucide-refresh-cw"
                color="neutral"
                variant="ghost"
                :loading="loadingTargets"
                @click="loadTargets"
              />
            </div>

            <UAlert
              v-if="targetsError.length > 0"
              color="error"
              variant="soft"
              icon="i-lucide-circle-alert"
              :description="targetsError"
            />

            <div
              v-else-if="loadingTargets && targets.length === 0"
              class="flex justify-center py-8"
            >
              <UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-muted" />
            </div>

            <div
              v-else-if="draftTargets.length === 0"
              class="py-6 text-center text-sm text-muted"
            >
              暂无发布配置
            </div>

            <div v-else class="overflow-x-auto">
              <table class="w-full table-fixed text-sm">
                <colgroup>
                  <col class="w-44">
                  <col class="w-36">
                  <col class="w-md">
                  <col class="w-36">
                  <col class="w-48">
                </colgroup>
                <thead>
                  <tr class="border-b border-default text-left text-xs text-muted">
                    <th class="px-3 py-2 font-medium">Publish Target</th>
                    <th class="px-3 py-2 font-medium">Environment</th>
                    <th class="px-3 py-2 font-medium">Connection String</th>
                    <th class="px-3 py-2 font-medium">Fingerprint</th>
                    <th class="px-3 py-2 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="target in draftTargets"
                    :key="target.id"
                    class="border-b border-default/60 last:border-b-0"
                  >
                    <td class="px-3 py-3">
                      <USelect
                        v-model="target.publishTarget"
                        :items="publishTargetItems"
                        class="w-full"
                        @update:model-value="handleDraftTargetChange(target)"
                      />
                    </td>
                    <td class="px-3 py-3">
                      <USelect
                        v-model="target.environment"
                        :items="environmentItems"
                        class="w-full"
                        @update:model-value="handleDraftTargetChange(target)"
                      />
                    </td>
                    <td class="px-3 py-3">
                      <input
                        v-model="target.connectionString"
                        class="w-full rounded-lg border border-default bg-default px-3 py-2 font-mono text-xs text-default"
                        placeholder="postgres://user:password@127.0.0.1:5432/database"
                        @input="handleDraftTargetChange(target)"
                      >
                    </td>
                    <td class="px-3 py-3">
                      <div
                        class="truncate font-mono text-xs"
                        :class="target.targetFingerprint.length > 0 ? 'text-success' : 'text-muted'"
                      >
                        {{ formatFingerprintStatus(target.targetFingerprint) }}
                      </div>
                    </td>
                    <td class="px-3 py-3">
                      <div class="flex flex-nowrap gap-2">
                        <UButton
                          label="测试"
                          icon="i-lucide-plug"
                          color="neutral"
                          variant="soft"
                          :loading="target.testing"
                          @click="testDraftTarget(target.id)"
                        />
                        <UButton
                          label="删除"
                          icon="i-lucide-trash"
                          color="error"
                          variant="ghost"
                          @click="removeDraftTarget(target.id)"
                        />
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </UCard>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { getConsoleErrorMessage } from '@tcg-cards/console-core';
import { useToast } from '@nuxt/ui/composables';

import {
  getDesktopPublishTargets,
  setDesktopPublishTargets,
  testDesktopPublishTarget,
  type DesktopPublishTarget,
} from '~/composables/useDesktopSettings';

definePageMeta({
  layout: 'admin',
  title:  '发布配置',
});

const toast = useToast();
const loadingTargets = ref(false);
const savingTargets = ref(false);
const targetsError = ref('');
const targets = ref<DesktopPublishTarget[]>([]);
const draftTargets = ref<PublishTargetDraft[]>([]);
const publishTargetItems = [
  { label: 'Hearthstone', value: 'hearthstone' },
  { label: 'Magic', value: 'magic' },
  { label: 'Yu-Gi-Oh!', value: 'yugioh' },
];
const environmentItems = [
  { label: 'Development', value: 'dev' },
  { label: 'Production', value: 'prod' },
];

/** Editable publish target row kept only in page-local state. */
type PublishTargetDraft = {
  id:                string;
  publishTarget:     string;
  environment:       string;
  credentialKey:     string | null;
  connectionString:  string;
  targetFingerprint: string;
  testing:           boolean;
  testError:         string;
};

/** Draft row created from one persisted publish target row. */
function createDraftTarget(target?: DesktopPublishTarget): PublishTargetDraft {
  return {
    id:                crypto.randomUUID(),
    publishTarget:     target?.publishTarget ?? '',
    environment:       target?.environment ?? '',
    credentialKey:     target?.credentialKey ?? null,
    connectionString:  target?.connectionString ?? '',
    targetFingerprint: target?.targetFingerprint ?? '',
    testing:           false,
    testError:         '',
  };
}

/** Appends one empty draft row to the local publish target table. */
function addDraftTarget() {
  draftTargets.value.push(createDraftTarget());
}

/** Removes one draft row from the local publish target table. */
function removeDraftTarget(id: string) {
  draftTargets.value = draftTargets.value.filter(target => target.id !== id);
}

/** Clears one resolved fingerprint after the draft identity changes. */
function handleDraftTargetChange(target: PublishTargetDraft) {
  target.targetFingerprint = '';
}

/** Short fingerprint status label derived from one resolved fingerprint. */
function formatFingerprintStatus(fingerprint: string) {
  if (!fingerprint) return '未获取';
  return fingerprint.slice(0, 8);
}

/** Resolves one draft row fingerprint from the current target fields. */
async function testDraftTarget(id: string) {
  const target = draftTargets.value.find(item => item.id === id);

  if (!target) return;

  target.testing = true;
  target.testError = '';

  try {
    const result = await testDesktopPublishTarget(
      target.publishTarget.trim() || null,
      target.environment.trim() || null,
      target.connectionString.trim() || null,
    );

    target.targetFingerprint = result.targetFingerprint;
  } catch (error) {
    console.error('Failed to test desktop publish target:', error);
    target.targetFingerprint = '';
    target.testError = getConsoleErrorMessage(error, '发布目标测试失败');
    toast.add({
      title: '发布目标测试失败',
      description: target.testError,
      color: 'error',
    });
  } finally {
    target.testing = false;
  }
}

/** Persists the current publish target table after all rows have valid fingerprints. */
async function saveTargets() {
  const rows = draftTargets.value.map(target => ({
    credentialKey: target.credentialKey,
    publishTarget: target.publishTarget.trim(),
    environment: target.environment.trim(),
    connectionString: target.connectionString.trim(),
    targetFingerprint: target.targetFingerprint.trim(),
  }));

  if (rows.some(row => !row.publishTarget || !row.environment || !row.connectionString)) {
    toast.add({
      title: '发布配置保存失败',
      description: '存在未填写完整的发布配置。',
      color: 'error',
    });
    return;
  }

  if (rows.some(row => !row.targetFingerprint)) {
    toast.add({
      title: '发布配置保存失败',
      description: '存在未测试或已失效的 fingerprint，请先逐行测试。',
      color: 'error',
    });
    return;
  }

  savingTargets.value = true;

  try {
    targets.value = await setDesktopPublishTargets(rows);
    draftTargets.value = targets.value.map(target => createDraftTarget(target));
    toast.add({
      title: '发布配置已保存',
      color: 'success',
    });
  } catch (error) {
    console.error('Failed to save desktop publish targets:', error);
    toast.add({
      title: '发布配置保存失败',
      description: getConsoleErrorMessage(error, '发布配置保存失败'),
      color: 'error',
    });
  } finally {
    savingTargets.value = false;
  }
}

/** Loads the current publish target rows from the desktop runtime. */
async function loadTargets() {
  loadingTargets.value = true;
  targetsError.value = '';

  try {
    targets.value = await getDesktopPublishTargets();
    draftTargets.value = targets.value.map(target => createDraftTarget(target));
  } catch (error) {
    console.error('Failed to load desktop publish targets:', error);
    targetsError.value = getConsoleErrorMessage(error, '发布配置读取失败');
  } finally {
    loadingTargets.value = false;
  }
}

onMounted(() => {
  void loadTargets();
});
</script>
