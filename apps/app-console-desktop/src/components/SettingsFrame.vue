<template>
  <div class="desktop-page space-y-6">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="desktop-section-title">{{ title }}</h1>
        <p v-if="description" class="mt-2 text-sm text-muted">{{ description }}</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <UButton label="编辑原始配置" icon="i-lucide-file-json" color="neutral" variant="soft" to="/settings/config-file" />
        <UButton label="打开配置目录" icon="i-lucide-folder-open" color="neutral" variant="soft" :loading="openingDirectory" @click="openDirectory" />
      </div>
    </div>
    <div class="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
      <UCard>
        <template #header><div class="font-medium">设置分类</div></template>
        <nav class="space-y-5" aria-label="设置分类">
          <section v-for="group in groups" :key="group.label" class="space-y-2">
            <h2 class="text-xs font-medium tracking-wide text-muted">{{ group.label }}</h2>
            <div class="space-y-2">
              <UButton v-for="item in group.items" :key="item.to" :label="item.label" :icon="item.icon" :to="item.to" color="neutral" :variant="route.path === item.to ? 'soft' : 'ghost'" class="w-full justify-start" />
            </div>
          </section>
        </nav>
      </UCard>
      <div class="space-y-6">
        <UAlert role="alert" v-if="error || localError" color="error" :description="error || localError" />
        <div v-if="loading && !snapshot" class="text-sm text-muted">正在读取设置…</div>
        <slot v-else-if="snapshot" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useDesktopSettings, settingsError } from '~/composables/useDesktopSettings';
import { generalSettings, gameSettings } from '~/composables/settings-navigation';
defineProps<{ title: string; description?: string }>();
const route = useRoute();
const { snapshot, loading, error, load, bridge } = useDesktopSettings();
const localError = ref('');
const openingDirectory = ref(false);
const groups = [
  { label: '通用设置', items: generalSettings },
  { label: '游戏设置', items: gameSettings },
];
/** Opens only the application's own configuration folder through the native bridge. */
async function openDirectory() {
  openingDirectory.value = true;
  try { await bridge.openDirectory(); }
  catch (cause) { localError.value = settingsError(cause); }
  finally { openingDirectory.value = false; }
}
onMounted(load);
</script>
