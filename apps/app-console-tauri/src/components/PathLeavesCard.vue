<template>
  <UCard>
    <template #header>
      <div>
        <div class="font-medium">{{ title }}</div>
        <div class="mt-1 text-xs text-muted">根目录未显式设置时自动从全局 data/asset 根推导（文件夹存在即适用）。</div>
      </div>
    </template>

    <div class="space-y-4">
      <div class="rounded-lg border border-primary/30 bg-primary/5 p-3">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2 text-sm font-semibold">
            <UIcon name="i-lucide-folder-tree" class="size-4 text-primary" />
            根目录
          </div>
          <UBadge
            :label="rootExplicit ? '显式' : '派生'"
            :color="rootExplicit ? 'primary' : 'neutral'"
            variant="soft"
            size="xs"
          />
        </div>
        <div class="mt-2">
          <DirectoryPickerField
            :value="rootExplicit ? (root ?? '') : ''"
            :placeholder="root ?? '未配置'"
            :loading="loading"
            :pick-loading="pickingKey === keyPrefix"
            :pick-disabled="busy"
            :clear-disabled="busy || !rootExplicit"
            @pick="pick(keyPrefix)"
            @clear="emit('save', keyPrefix, null)"
          />
        </div>
      </div>

      <div
        v-for="leaf in leaves"
        :key="leaf.name"
        class="rounded-lg border border-default p-3"
      >
        <div class="flex items-center justify-between gap-2">
          <div class="text-sm font-medium">{{ leaf.label }}</div>
          <UBadge
            :label="leaf.explicit ? '显式' : '派生'"
            :color="leaf.explicit ? 'primary' : 'neutral'"
            variant="soft"
            size="xs"
          />
        </div>
        <div class="mt-2">
          <DirectoryPickerField
            :value="leaf.explicit ? (leaf.path ?? '') : ''"
            :placeholder="leaf.path ?? '未配置'"
            :loading="loading"
            :pick-loading="pickingKey === `${keyPrefix}.${leaf.name}`"
            :pick-disabled="busy"
            :clear-disabled="busy || !leaf.explicit"
            @pick="pick(`${keyPrefix}.${leaf.name}`)"
            @clear="emit('save', `${keyPrefix}.${leaf.name}`, null)"
          />
        </div>
      </div>

      <UAlert
        v-if="pickError"
        color="error"
        variant="soft"
        icon="i-lucide-circle-alert"
        :description="pickError"
      />

      <p v-if="leaves.length === 0" class="text-sm text-muted">
        该游戏没有声明此类型的叶子。
      </p>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import { getConsoleErrorMessage } from '@tcg-cards/console-core';

import { pickDesktopDirectory } from '~/composables/useDesktopSettings';
import type { GamePathLeafState } from '~/composables/useGamePaths';

const props = defineProps<{
  title:        string;
  keyPrefix:    string;
  root:         string | null;
  rootExplicit: boolean;
  leaves:       GamePathLeafState[];
  loading:      boolean;
}>();

const emit = defineEmits<{ save: [key: string, value: string | null] }>();

const pickingKey = ref<string | null>(null);
const pickError = ref('');

const busy = computed(() => props.loading || pickingKey.value !== null);

function currentPath(key: string): string | null {
  if (key === props.keyPrefix) return props.root;
  const leafName = key.slice(props.keyPrefix.length + 1);
  return props.leaves.find(leaf => leaf.name === leafName)?.path ?? null;
}

async function pick(key: string) {
  pickingKey.value = key;
  pickError.value = '';
  try {
    const directory = await pickDesktopDirectory(currentPath(key));
    if (directory) {
      emit('save', key, directory);
    }
  } catch (error) {
    pickError.value = getConsoleErrorMessage(error, '目录选择失败');
  } finally {
    pickingKey.value = null;
  }
}
</script>
