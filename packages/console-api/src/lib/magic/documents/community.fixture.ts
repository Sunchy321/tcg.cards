/** Represents the repository's paired JSON without depending on an external checkout. */
export const communityTranslation = {
  version: '20260925',
  intro:   { contents: [
    { en: 'Magic: The Gathering Comprehensive Rules', zh: '万智牌完整规则' },
    { en: 'These rules are effective as of September 25, 2026.', zh: '此规则于2026年9月25日起生效。' },
    { en: 'Introduction', zh: '前言' },
    { en: 'A reference rulebook.', zh: '一本规则参考文档。' },
    { en: 'Consult the latest rules.', zh: '请参阅最新规则。' },
  ] },
  main: [{ chapter:  '1.', en:       'Game Concepts', zh:       '游戏概念', subrules: [
    { chapter:  '100.', en:       'General', zh:       '总则', subrules: [
      { chapter: '100.1.', en:      'Pay {W}. See rule 100.2.', zh:      '支付 {W}。参见规则100.2。', extras:  [
        { en: 'Example: Pay one white mana.', zh: '例如：支付一点白色法术力。' },
        { en: 'Example: Do not pay twice.', zh: '例如：不要支付两次。' },
      ] },
      { chapter: '100.2.', en:      'Continue playing.', zh:      '继续游戏。', extras:  [
        { en: 'The game continues normally.', zh: '游戏正常继续。' },
      ] },
      { chapter: '100.3.', en: 'This rule has no translation.', zh: '' },
    ] },
  ] }],
  glossary: [{ enname: 'Team vs. Team Variant', zhname: '团队对抗玩法', en: 'A multiplayer variant.', zh: '一种多人玩法。' }],
  credits:  { contents: [
    { en: 'Credits', zh: '版权信息' },
    { en: 'Editing: Test editor.', zh: '编辑：测试编辑。' },
    { en: 'Thanks to contributors.', zh: '感谢贡献者。' },
  ] },
  homepage: '<p>Repository introduction, not a source translation.</p>',
};

/** Includes grouped paragraphs, examples and a glossary term from the paired fixture. */
export const communitySource = `Magic: The Gathering Comprehensive Rules

These rules are effective as of September 25, 2026.

Introduction

A reference rulebook.

Consult the latest rules.

Contents

Credits

1. Game Concepts

100. General

100.1. Pay {W}. See rule 100.2.

Example: Pay one white mana.

Example: Do not pay twice.

100.2. Continue playing.

The game continues normally.

100.3. This rule has no translation.

Glossary

Team vs. Team Variant
A multiplayer variant.

Credits

Editing: Test editor.

Thanks to contributors.
`;
