<template>
  <div class="desktop-page">
    <div class="space-y-6">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 class="desktop-section-title">模型配置</h1>
          <p class="mt-2 text-sm text-muted">配置 AI 模型 API，用于公告解析等 AI 功能。</p>
        </div>
        <DesktopConfigHeaderActions />
      </div>

      <div class="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <DesktopSettingsSidebar />

        <UCard>
          <template #header>
            <div>
              <div class="font-medium">模型配置</div>
              <div class="mt-1 text-xs text-muted">支持 OpenAI 兼容格式的 API。</div>
            </div>
          </template>

          <div class="space-y-4">
            <div class="space-y-2">
              <label for="ai-api-key" class="text-sm font-medium text-default">API Key</label>
              <input
                id="ai-api-key"
                v-model="form.apiKey"
                type="password"
                class="w-full rounded-lg border border-default bg-default px-3 py-2 text-sm text-default font-mono"
                placeholder="sk-..."
                :disabled="loading || saving"
              >
            </div>

            <div class="space-y-2">
              <label for="ai-base-url" class="text-sm font-medium text-default">Base URL</label>
              <input
                id="ai-base-url"
                v-model="form.baseUrl"
                class="w-full rounded-lg border border-default bg-default px-3 py-2 text-sm text-default"
                placeholder="https://api.openai.com/v1"
                :disabled="loading || saving"
              >
            </div>

            <div class="space-y-2">
              <label for="ai-model" class="text-sm font-medium text-default">Model</label>
              <input
                id="ai-model"
                v-model="form.model"
                class="w-full rounded-lg border border-default bg-default px-3 py-2 text-sm text-default"
                placeholder="gpt-4o-mini"
                :disabled="loading || saving"
              >
            </div>

            <div v-if="testResult" class="rounded-lg p-3 text-sm" :class="testResult.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'">
              {{ testResult.message }}
            </div>

            <div class="flex gap-2">
              <UButton
                label="保存"
                icon="i-lucide-save"
                color="primary"
                :loading="saving"
                :disabled="loading"
                @click="save"
              />
              <UButton
                label="测试连接"
                icon="i-lucide-plug"
                color="neutral"
                variant="soft"
                :loading="testing"
                :disabled="loading || !form.apiKey"
                @click="testConnection"
              />
            </div>
          </div>
        </UCard>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', title: '模型配置' });
import { getDesktopAiConfig, setDesktopAiConfig, type DesktopAiConfig } from '~/composables/useDesktopSettings';
import { onMounted, reactive, ref } from 'vue';

const loading = ref(false);
const saving = ref(false);
const testing = ref(false);
const testResult = ref<{ ok: boolean; message: string } | null>(null);

const form = reactive({ apiKey: '', baseUrl: '', model: '' });

function fill(data: DesktopAiConfig) {
  form.apiKey = data.apiKey ?? '';
  form.baseUrl = data.baseUrl ?? '';
  form.model = data.model ?? '';
}

onMounted(async () => {
  loading.value = true;
  try { fill(await getDesktopAiConfig()); } catch { /* ignore */ }
  finally { loading.value = false; }
});

async function save() {
  saving.value = true;
  testResult.value = null;
  try {
    const result = await setDesktopAiConfig(
      form.apiKey || null, form.baseUrl || null, form.model || null,
    );
    fill(result);
  } finally { saving.value = false; }
}

async function testConnection() {
  testing.value = true;
  testResult.value = null;
  try {
    const baseUrl = form.baseUrl || 'https://api.openai.com/v1';
    const res = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${form.apiKey}` },
    });
    if (res.ok) {
      testResult.value = { ok: true, message: '连接成功' };
    } else {
      const text = await res.text().catch(() => '');
      testResult.value = { ok: false, message: `连接失败 (${res.status}): ${text.slice(0, 200)}` };
    }
  } catch (e: any) {
    testResult.value = { ok: false, message: `连接失败: ${e.message}` };
  } finally { testing.value = false; }
}
</script>
