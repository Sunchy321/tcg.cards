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
    <UCard v-if="game === 'yugioh'">
      <template #header><h2 class="font-medium">测试发布目标</h2></template>
      <div class="space-y-5">
        <div class="grid gap-4 sm:grid-cols-2">
          <SettingField
            label="目标标识"
            :value="snapshot?.config.games.yugioh?.publish?.publishTargetId"
            placeholder="例如 yugioh-test"
            :save="saveYugiohTargetId"
          />
          <div>
            <div class="text-sm font-medium">环境</div>
            <div class="mt-1 text-sm text-muted">测试环境</div>
          </div>
        </div>
        <p class="text-xs text-muted">
          {{ snapshot?.config.games.yugioh?.publish?.targetFingerprint ? '目标身份已绑定。' : '首次发布前会核对并记录目标身份。' }}
        </p>
        <SettingField
          label="连接字符串"
          secret
          :configured="snapshot?.credentials['yugioh-publish']"
          :save="value => secret('yugioh-publish', value)"
        />
      </div>
    </UCard>
    <YugiohYugiohManager v-if="game === 'yugioh'" />
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
/** Saves the fixed test target metadata, or removes its metadata and secret together. */
async function saveYugiohTargetId(value: string | null) {
  if (value == null) {
    await update('games.yugioh.publish', null);
    await secret('yugioh-publish', null);
    return;
  }

  const existing = snapshot.value?.config.games.yugioh?.publish;
  await update('games.yugioh.publish', {
    publishTargetId:   value,
    environment:       'test',
    targetFingerprint: existing?.targetFingerprint ?? '',
  });
}
watch(() => snapshot.value?.revision, refresh);
onMounted(refresh);
</script>
