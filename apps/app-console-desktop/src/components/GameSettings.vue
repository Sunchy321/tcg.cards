<template>
  <SettingsFrame :title="`${label}设置`">
    <template v-if="game !== 'yugioh'">
      <UAlert v-if="error" role="alert" color="error" :description="error" />
      <UCard v-for="kind in kinds" :key="kind.key">
        <template #header
          ><h2 class="font-medium">{{ kind.label }}</h2></template
        >
        <div class="space-y-5">
          <SettingField
            label="根目录"
            :value="snapshot?.config.paths[`${game}.${kind.key}`]"
            :placeholder="derived?.[kind.key].root ?? '未配置'"
            directory
            :save="value => savePath(`${game}.${kind.key}`, value)"
          />
          <SettingField
            v-for="leaf in derived?.[kind.key].leaves ?? []"
            :key="leaf.key"
            :label="leaf.label"
            :value="snapshot?.config.paths[leaf.key]"
            :placeholder="leaf.path ?? '未配置'"
            directory
            :save="value => savePath(leaf.key, value)"
          />
        </div>
      </UCard>
    </template>
    <UCard v-if="game === 'hearthstone'">
      <template #header><h2 class="font-medium">图片设置</h2></template>
      <div class="space-y-5">
        <SettingField
          label="图片渲染服务地址"
          :value="snapshot?.config.games.hearthstone?.image?.rendererBaseUrl"
          :save="value => update('games.hearthstone.image.rendererBaseUrl', value)"
        />
        <SettingField
          label="图片存储目录"
          :value="snapshot?.config.games.hearthstone?.image?.bucketDir"
          directory
          :save="value => update('games.hearthstone.image.bucketDir', value)"
        />
      </div>
    </UCard>
    <UCard v-if="game === 'yugioh'">
      <template #header><h2 class="font-medium">图片设置</h2></template>
      <SettingField
        label="卡牌图片目录"
        :value="snapshot?.config.games.yugioh?.image?.bucketDir"
        directory
        :save="value => update('games.yugioh.image.bucketDir', value)"
      />
    </UCard>
    <UCard v-if="game === 'yugioh' && snapshot?.config.games.yugioh?.publish">
      <template #header><h2 class="font-medium">已有发布连接</h2></template>
      <SettingField
        label="连接字符串"
        secret
        :configured="snapshot?.credentials['yugioh-publish']"
        :save="value => secret('yugioh-publish', value)"
      />
    </UCard>
  </SettingsFrame>
</template>
<script setup lang="ts">
import { useDesktopSettings, settingsError } from '~/composables/useDesktopSettings';
import type { GamePaths } from '../../electron/contract';
const props = defineProps<{ game: 'magic' | 'hearthstone' | 'yugioh' }>();
const label = { magic: '万智牌', hearthstone: '炉石传说', yugioh: '游戏王' }[props.game];
const kinds = [
  { key: 'data' as const, label: '数据目录' },
  { key: 'image' as const, label: '图片目录' },
];
const { snapshot, update, secret, bridge } = useDesktopSettings();
const derived = ref<GamePaths | null>(null);
const error = ref('');
/** Reads effective folders without persisting automatically derived paths. */
async function refresh() {
  if (props.game === 'yugioh') return;
  try {
    derived.value = await bridge.paths(props.game);
  } catch (cause) {
    error.value = settingsError(cause);
  }
}
/** Refreshes derived previews after a confirmed explicit override changes. */
async function savePath(key: string, value: string | null) {
  await update(`paths.${key}`, value);
  await refresh();
}
watch(() => snapshot.value?.revision, refresh);
onMounted(refresh);
</script>
