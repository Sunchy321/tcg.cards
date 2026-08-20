export default {
  nav: { intro: '介绍', model: '数据模型', overview: '概览', on_this_page: '本页内容' },
  portal: {
    eyebrow: '开发者文档', title: '使用集换式卡牌数据进行构建。', description: '详细的卡牌游戏 API 契约，直接从验证每一份响应的同一套 Schema 生成。',
    contract_title: '端点契约', contract_description: '每个端点拥有独立页面，完整展示请求与响应契约。',
    schema_title: 'Schema 优先', schema_description: '嵌套卡牌模型始终完整展开，不隐藏任何字段上下文。',
    version_title: '稳定版本', version_description: '所有正式文档链接均明确固定在 v1 API 契约。',
  },
  games: {
    magic: { description: 'Magic: The Gathering 的卡牌、印刷版本、系列、赛制、公告与枚举目录。' },
    hearthstone: { description: 'Hearthstone 的卡牌、系列、补丁、赛制、标签与枚举目录。' },
  },
  reference: { input: '输入 Schema', output: '输出 Schema', resources: 'API 资源' },
  schema: { field: '字段', type: '类型与约束', description: '含义', optional: '可选', required: '必填', default: '默认值', description_pending: '字段含义将由本地化模型元数据提供。' },
  model: { description: '从公共 API 契约推导的完整资源输出 Schema。' },
};
