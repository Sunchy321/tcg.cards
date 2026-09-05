<template>
  <div class="desktop-page h-full space-y-4 overflow-y-auto">
    <div class="rounded-xl border border-slate-200 bg-white p-4">
      <div class="flex items-center gap-6">
        <div>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-wand-2" class="size-5 text-primary" />
            <h1 class="text-xl font-semibold">手动替换卡图</h1>
          </div>
          <p class="mt-1 text-sm text-muted">
            用本地图片替换指定印刷的卡图。手动结果 image_source=manual,后续自动导入与投影不会覆盖。
          </p>
        </div>
      </div>
    </div>

    <div class="grid gap-4">
      <TaskController
        title="手动替换卡图"
        :operations="[operation]"
        @completed="onCompleted"
      >
        <template #params="{ disabled }">
          <div class="space-y-4 pt-4">
            <USelect
              v-model="form.mode"
              :items="modeOptions"
              class="w-full sm:max-w-xs"
              :disabled="disabled"
            />
            <div class="grid grid-cols-2 gap-4">
              <UFormField orientation="horizontal" :ui="{ root: '!justify-start' }" label="系列代码" required>
                <UInput v-model="form.set" placeholder="如 dmu" autocomplete="off" autocapitalize="off" spellcheck="false" :disabled="disabled" />
              </UFormField>
              <UFormField orientation="horizontal" :ui="{ root: '!justify-start' }" label="语言" required>
                <UInput v-model="form.lang" placeholder="如 en / zhs" :disabled="disabled" />
              </UFormField>
            </div>
            <template v-if="form.mode === 'single'">
              <div class="grid grid-cols-2 gap-4">
                <UFormField orientation="horizontal" :ui="{ root: '!justify-start' }" label="编号" required>
                  <UInput v-model="form.number" placeholder="如 123" :disabled="disabled" />
                </UFormField>
                <UFormField orientation="horizontal" :ui="{ root: '!justify-start' }" label="面序号(可选)">
                  <UInput v-model="form.faceIndex" placeholder="留空=单面,多面填 0/1" :disabled="disabled" />
                </UFormField>
              </div>
              <UButton :icon="file ? 'i-lucide-check' : 'i-lucide-upload'" variant="soft" :disabled="disabled" @click="pick(false)">
                {{ file?.name ?? '选择单张图片(png/jpg/webp)' }}
              </UButton>
            </template>
            <template v-else>
              <UButton :icon="file ? 'i-lucide-check' : 'i-lucide-file-archive'" variant="soft" :disabled="disabled" @click="pick(true)">
                {{ file?.name ?? '选择压缩包(zip)' }}
              </UButton>
              <p class="text-xs text-muted">
                zip 内文件名需为「编号.webp/png/jpg」或多面「编号-0.png」。
              </p>
            </template>
            <input ref="fileInput" type="file" class="hidden" @change="onFilePicked" />
          </div>
        </template>
      </TaskController>

      <TaskResultCard :result="taskResult" />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { TaskPageSnapshot } from '@tcg-cards/model/task';
import type { TaskOperation } from '~/components/task/TaskController.vue';
import { orpc } from '~/lib/orpc';

definePageMeta({ layout: 'admin', title: '手动替换卡图' });

const modeOptions = [
  { label: '单张替换', value: 'single' },
  { label: '压缩包替换', value: 'zip' },
];

const form = reactive({
  mode:       'single' as 'single' | 'zip',
  set:        '',
  lang:       '',
  number:     '',
  faceIndex:  '',
  fileName:   '',
  dataBase64: '',
  zipBase64:  '',
});
useLocalPersist('magic-image-import:manual', form, ['mode', 'set', 'lang', 'number', 'faceIndex']);
const fileInput = ref<HTMLInputElement | null>(null);
const file = ref<{ name: string } | null>(null);
const taskResult = ref<Record<string, unknown> | null>(null);
let pickMode: 'single' | 'zip' = 'single';

function pick(mode: 'single' | 'zip') {
  pickMode = mode;
  form.mode = mode;
  fileInput.value?.click();
}

function onFilePicked(event: Event) {
  const input = event.target as HTMLInputElement;
  const picked = input.files?.[0];
  input.value = '';
  if (!picked) return;
  const reader = new FileReader();
  reader.onload = () => {
    const b64 = String(reader.result ?? '').split(',').pop() ?? '';
    file.value = { name: picked.name };
    form.fileName = picked.name;
    if (pickMode === 'single') {
      form.dataBase64 = b64;
      form.zipBase64 = '';
    } else {
      form.zipBase64 = b64;
      form.dataBase64 = '';
    }
  };
  reader.readAsDataURL(picked);
}

function onCompleted(snap: TaskPageSnapshot) {
  taskResult.value = (snap.result as Record<string, unknown> | undefined) ?? null;
}

const operation = computed<TaskOperation>(() => {
  const singleReady = form.mode === 'single' && !!form.number && !!form.dataBase64;
  const zipReady = form.mode === 'zip' && !!form.zipBase64;
  return {
    key:      'manual',
    label:    '执行替换',
    icon:     'i-lucide-play',
    disabled: !(form.set.trim() && form.lang.trim() && (singleReady || zipReady)),
    create:   async () => orpc.magic.createTask.manualImageReplace({
      mode:       form.mode,
      set:        form.set.trim(),
      lang:       form.lang.trim(),
      number:     form.mode === 'single' ? form.number.trim() || undefined : undefined,
      faceIndex:  form.mode === 'single' && form.faceIndex.trim() ? Number(form.faceIndex) : undefined,
      fileName:   form.fileName || undefined,
      dataBase64: form.mode === 'single' ? form.dataBase64 : undefined,
      zipBase64:  form.mode === 'zip' ? form.zipBase64 : undefined,
    }) as Promise<TaskPageSnapshot>,
  };
});
</script>
