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
    tryIt:     '试一试',
  },
  tryIt: {
    public:          '公共',
    requiresKey:     '该端点需要 API 密钥。',
    requiresKeyHint: '登录后即可管理密钥(即将上线)——密钥可解锁其余端点。',
    run:             '运行',
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
  search: {
    placeholder: '搜索…',
    endpoints:   '端点',
    fields:      '字段',
    enums:       '枚举',
  },
  magic,
  hearthstone,
};
