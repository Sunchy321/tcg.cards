import z from 'zod';

import { toTermSlug } from './parser';
import { importText } from './text';
import type { Revision } from './store';

const pair = z.object({ en: z.string().min(1), zh: z.string() });

/** Describes a numbered bilingual entry and its attached source paragraphs. */
interface Rule {
  chapter: string;
  en: string;
  zh: string;
  subrules: Rule[];
  extras: z.infer<typeof pair>[];
}

const rule: z.ZodType<Rule> = pair.extend({
  chapter: z.string().regex(/^(?:[1-9]\.|\d{3}\.|\d{3}\.\d+(?:\.|[a-z]+))$/),
  subrules: z.lazy(() => rule.array()).default([]),
  extras: pair.array().default([]),
});

const edition = z.object({
  version: z.string().regex(/^\d{8}$/),
  intro: z.object({ contents: pair.array().min(3) }),
  main: rule.array().min(1),
  glossary: pair.extend({ enname: z.string().min(1), zhname: z.string() }).array(),
  credits: z.object({ contents: pair.array().min(1) }),
});

/** Tracks each source paragraph so unmatched translations cannot disappear silently. */
interface Part {
  en: string;
  zh: string;
  used: boolean;
}

/** Reports source alignment failures using visible dates, rule numbers and terms. */
export class CrTranslationError extends Error {
  /** Collects edition-specific alignment diagnostics without exposing storage identifiers. */
  constructor(public readonly issues: string[]) {
    super(issues.join('\n'));
    this.name = 'CrTranslationError';
  }
}

/** Read the edition's authoritative English effective date independently of repository labels. */
export function crTranslationEffectiveDate(content: unknown, label: string): string {
  const header = z.object({ intro: z.object({ contents: z.object({ en: z.string() }).array().min(2) }) }).safeParse(content);
  const sentence = header.success ? header.data.intro.contents[1]!.en.trim() : '';
  const match = sentence.match(/^These rules are effective as of ([A-Za-z]+) (\d{1,2}), (\d{4})\.?$/);
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const month = match == null ? 0 : months.indexOf(match[1]!) + 1;
  const date = match == null ? '' : `${match[3]}-${String(month).padStart(2, '0')}-${match[2]!.padStart(2, '0')}`;
  if (month === 0 || !z.iso.date().safeParse(date).success) {
    throw new CrTranslationError([`${label}：无法识别译文依据的英文生效日期，请检查中英对照文件。`]);
  }
  return date;
}

/** Ignores layout whitespace while preserving every source word and symbol. */
function normalized(text: string): string {
  return text.replace(/^\uFEFF/, '').replace(/\s+/gu, ' ').trim();
}

/** Parses a complete bilingual edition before using any of its translations. */
export function parseCrTranslation(content: unknown, label: string) {
  const parsed = edition.safeParse(content);
  if (!parsed.success) throw new CrTranslationError([`${label}：译文文件格式无效，请检查中英对照文件。`]);
  return parsed.data;
}

/** Validates paired repository data against an already saved English revision. */
export function alignCrTranslation(content: unknown, source: Revision, versionTag: string) {
  const data = parseCrTranslation(content, versionTag);
  if (crTranslationEffectiveDate(data, versionTag).replaceAll('-', '') !== versionTag) {
    throw new CrTranslationError([`${versionTag}：译文依据的英文生效日期不符。`]);
  }
  const groups = new Map<string, { label: string; parts: Part[] }>();
  const ruleChildren = new Map<string | null, string[]>();
  const anchors = new Set(source.nodes.flatMap(node => node.anchor == null ? [] : [node.anchor]));
  const issues: string[] = [];

  /** Adds independently consumable paragraphs under their English structural identity. */
  function add(key: string, label: string, pairs: z.infer<typeof pair>[]) {
    if (groups.has(key)) throw new CrTranslationError([`${versionTag}：${label} 重复出现。`]);
    const parts = pairs.flatMap(value => {
      const en = value.en.split('\n');
      const zh = value.zh === '' ? en.map(() => '') : value.zh.split('\n');
      if (en.length !== zh.length) throw new CrTranslationError([`${versionTag}：${label} 的中英文段落无法对应。`]);
      return en.flatMap((text, index) => {
        if (!normalized(text)) {
          if (zh[index]!.trim()) throw new CrTranslationError([`${versionTag}：${label} 存在没有对应英文的译文。`]);
          return [];
        }
        return [{ en: normalized(importText(text, anchors).rawText), zh: zh[index]!.trim(), used: false }];
      });
    });
    groups.set(key, { label, parts });
  }

  const [title, , introduction, ...intro] = data.intro.contents;
  if (normalized(title!.en) !== 'Magic: The Gathering Comprehensive Rules'
    || normalized(introduction!.en) !== 'Introduction') {
    throw new CrTranslationError([`${versionTag}：译文前言的英文标题无法对应。`]);
  }
  add('intro', '前言', [introduction!, ...intro]);

  /** Keeps rule paragraphs and examples within their own numbered source group. */
  function addRule(entry: Rule, parent: string | null) {
    const key = entry.chapter.replace(/\.$/, '');
    add(key, `规则 ${entry.chapter}`, [entry, ...entry.extras]);
    const children = ruleChildren.get(parent) ?? [];
    children.push(key);
    ruleChildren.set(parent, children);
    entry.subrules.forEach(child => addRule(child, key));
  }
  data.main.forEach(entry => addRule(entry, null));
  const byId = new Map(source.nodes.map(node => [node.id, node]));
  const ruleKeys = new Set([...ruleChildren.values()].flat());
  for (const [parent, expected] of ruleChildren) {
    const actual = source.nodes.filter(node => node.anchor != null && ruleKeys.has(node.anchor)
      && (node.parentId == null ? null : byId.get(node.parentId)?.anchor) === parent)
      .sort((a, b) => a.siblingOrder - b.siblingOrder).map(node => node.anchor);
    if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
      issues.push(`${versionTag}：${parent == null ? '正文' : `规则 ${parent}`} 的条目层级或顺序与已导入原文不一致。`);
    }
  }
  add('glossary', '词汇表', [{ en: 'Glossary', zh: '词汇表' }]);
  for (const term of data.glossary) {
    add(`glossary.${toTermSlug(term.enname)}`, `词条 ${term.enname}`, [{ en: term.enname, zh: term.zhname }, term]);
  }
  add('credits', '版权信息', data.credits.contents.filter(value => !/^These rules are effective as of .+\.$/.test(value.en)));
  const keys = [...groups.keys()].sort((a, b) => b.length - a.length);
  const nodes = [];

  for (const original of source.nodes) {
    const anchor = original.anchor;
    const key = anchor == null ? undefined : keys.find(key => anchor === key || anchor.startsWith(`${key}.`));
    const group = key == null ? undefined : groups.get(key);
    if (group == null) {
      issues.push(`${versionTag}：原文 ${anchor ?? '未编号段落'} 在译文文件中没有对应条目。`);
      continue;
    }
    let remaining = normalized(original.rawText);
    const translated: string[] = [];
    let missing = false;
    while (remaining) {
      const part = group.parts.find(part => !part.used && (remaining === part.en || remaining.startsWith(`${part.en} `)));
      if (part == null) {
        issues.push(`${versionTag}：${group.label} 的英文内容与已导入原文不一致，或原文段落未被完整识别。`);
        break;
      }
      part.used = true;
      remaining = remaining.slice(part.en.length).trimStart();
      translated.push(part.zh);
      missing ||= part.zh === '';
    }
    // A grouped source node needs all of its paragraphs; otherwise the reader falls back to English.
    if (!remaining && !missing && translated.length > 0) {
      nodes.push({ sourceNodeId: original.id, ...importText(translated.join('\n\n'), anchors), translationMethod: 'human' as const });
    }
  }
  for (const group of groups.values()) {
    if (group.parts.some(part => !part.used)) issues.push(`${versionTag}：${group.label} 含有未能对应独立原文条目的内容。`);
  }
  if (issues.length > 0) throw new CrTranslationError([...new Set(issues)]);
  return { documentId: source.documentId, sourceRevisionId: source.id, language: 'zhs', title: title!.zh || source.title, nodes };
}
