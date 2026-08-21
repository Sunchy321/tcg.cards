import magic from './magic';
import hearthstone from './hearthstone';

export default {
  nav: {
    intro:        '介绍',
    model:        '数据模型',
    overview:     '概览',
    on_this_page: '本页内容',
    changelog:    '更新日志',
    guide:        '指南',
    settings:     '设置',
  },
  portal: {
    title:       'API 文档',
    description: 'TCG.CARDS 数据 API 的参考文档。',
  },
  reference: {
    input:     '输入 Schema',
    output:    '输出 Schema',
    resources: 'API 资源',
    endpoints: '{n} 个端点',
  },
  schema: {
    field:               '字段',
    type:                '类型与约束',
    description:         '含义',
    optional:            '可选',
    required:            '必填',
    default:             '默认值',
    description_pending: '该字段暂无可用的说明。',
  },
  model: {
    description: '该资源返回的字段与类型。',
  },
  settings: {
    todo: '待办:API 密钥管理(需登录)。',
  },
  magic,
  hearthstone,
};
