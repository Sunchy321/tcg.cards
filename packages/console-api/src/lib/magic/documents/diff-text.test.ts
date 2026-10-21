import { expect, test } from 'bun:test';
import { textDiff } from './diff-text';

test('preserves unchanged Chinese text between separate edits', () => {
  expect(textDiff('甲乙丙丁', '甲水乙丙火丁')?.blocks).toEqual([
    { type: 'common', text: '甲' },
    { type: 'added', text: '水' },
    { type: 'common', text: '乙丙' },
    { type: 'added', text: '火' },
    { type: 'common', text: '丁' },
  ]);
});

test('leaves the long unchanged creature-type list unhighlighted between distant edits', () => {
  const unchanged = '儿童[Child]、盖美拉、市民、僧侣、小丑[Clown]、石化鸡蛇、组构体、懦夫、蟹、鳄鱼、星神、禁军、赛博人[Cyberman]、独眼巨人、戴立克[Dalek]、道西、半神、恶魔、逃亡者[Deserter]、侦探[Detective]、魔鬼、恐龙、巨灵、博士[Doctor]、狗、龙、龙兽、';
  const before = `驯鹿、病媒、猫、半人马、章人、${unchanged}奴兽`;
  const after = `水豚、驯鹿、病媒、猫、半人马、${unchanged}无畏舰、奴兽`;
  const blocks = textDiff(before, after)!.blocks;
  expect(blocks.some(block => block.type === 'common' && block.text.includes(unchanged))).toBe(true);
  expect(blocks.filter(block => block.type === 'removed').map(block => block.text).join('')).toBe('章人、');
  expect(blocks.filter(block => block.type === 'added').map(block => block.text).join('')).toBe('水豚、无畏舰、');
  expect(blocks.filter(block => block.type !== 'added').map(block => block.text).join('')).toBe(before);
  expect(blocks.filter(block => block.type !== 'removed').map(block => block.text).join('')).toBe(after);
});

test('preserves Unicode characters and paragraph boundaries across separate replacements', () => {
  const blocks = textDiff('甲😀乙\n\n丙𠮷丁', '甲🐻乙\n\n丙龍丁')!.blocks;
  expect(blocks).toEqual([
    { type: 'common', text: '甲' }, { type: 'removed', text: '😀' }, { type: 'added', text: '🐻' },
    { type: 'common', text: '乙\n\n丙' }, { type: 'removed', text: '𠮷' }, { type: 'added', text: '龍' },
    { type: 'common', text: '丁' },
  ]);
});

test('keeps added rule references whole and handles unchanged or empty text', () => {
  expect(textDiff('参见规则100.1。', '参见规则100.1与100.2。')?.blocks).toEqual([
    { type: 'common', text: '参见规则100.1' },
    { type: 'added', text: '与100.2' },
    { type: 'common', text: '。' },
  ]);
  expect(textDiff('相同', '相同')).toBeNull();
  expect(textDiff('', '新增')?.blocks).toEqual([{ type: 'added', text: '新增' }]);
  expect(textDiff('删除', '')?.blocks).toEqual([{ type: 'removed', text: '删除' }]);
});
