<template>
  <AnnouncementManager
    game="magic"
    :sources="sources"
    :type-labels="typeLabels"
    :status-labels="statusLabels"
    :config="config"
    apply
  />
</template>

<script setup lang="ts">
import { changeStatusByType, gameChangeType } from '#model/magic/schema/announcement';

import type { AnnouncementFormConfig } from '~/utils/announcement-form-yaml';

definePageMeta({ layout: 'admin', title: '公告管理' });

const sources = [
  { label: 'Wizards', value: 'wizards' },
  { label: 'Commander RC', value: 'commander-rc' },
];

const typeLabels: Record<string, string> = {
  card_change:  '合法性变更',
  card_update:  '数值/属性变更',
  set_change:   '系列事件',
  rule_change:  '规则变更',
  format_birth: '赛制上线',
  format_death: '赛制下架',
  card_split:   '卡牌分裂',
  card_merge:   '卡牌合并',
};

const statusLabels: Record<string, string> = {
  banned_as_commander:  '指挥官禁用',
  banned_as_companion:  '行侣禁用',
  banned_in_bo1:        'BO1 禁用',
  banned:               '完全禁用',
  game_changer:         '游戏变革者',
  legal:                '合法',
  restricted:           '限制',
  suspended:            '暂停',
  unavailable:          '不可用',
  score:                '计分',
  extend:               '系列扩展',
  buff:                 '增强',
  nerf:                 '削弱',
  tweak:                '小更新',
  revert:               '退环境回调',
  rework:               '重做',
  text_fix:             '文本修复',
  text_adjust:          '文本调整',
  bugged:               '数据异常',
  bugfix:               'Bug 修复',
};

const config: AnnouncementFormConfig = {
  types:         [...gameChangeType.options],
  statusByType:  changeStatusByType,
  fields:        { versionFields: false, prevVersion: true, platformDates: true, deltaGlow: false },
};
</script>
