import { CrTranslationError, crTranslationEffectiveDate, parseCrTranslation } from './community';
import { importText } from './text';

/** Holds one paragraph together with its structural context and destination. */
interface Part {
  context: string;
  group:   string;
  text:    string;
  write:   (text: string) => void;
}

/** Retains the schema-validated edition shape for traversal and rewriting. */
type Edition = ReturnType<typeof parseCrTranslation>;

/** Ignores layout and import annotations without erasing words or punctuation. */
function sourceText(text: string): string {
  return importText(text, new Set()).rawText.replace(/^\uFEFF/, '').replace(/\s+/gu, ' ').trim();
}

/** Indexes paragraphs while keeping headings, rules and glossary contexts distinct. */
function editionParts(data: Edition): Map<string, Part[]> {
  const parts = new Map<string, Part[]>();
  const groups = new Set<string>();
  /** Rejects ambiguous source identities before their wording can enter the catalogue. */
  function group(key: string) {
    if (groups.has(key)) throw new CrTranslationError([`${data.version}：${key} 重复出现。`]);
    groups.add(key);
  }
  /** Validates paragraph pairing and preserves each paragraph's own destination. */
  function add(pair: { en: string, zh: string }, role: string, context: string[], group: string) {
    const en = pair.en.split('\n');
    const zh = pair.zh === '' ? en.map(() => '') : pair.zh.split('\n');
    if (en.length !== zh.length) throw new CrTranslationError([`${data.version}：${group} 的中英文段落无法对应。`]);
    en.forEach((text, index) => {
      const source = sourceText(text);
      if (!source) {
        if (zh[index]!.trim()) throw new CrTranslationError([`${data.version}：${group} 存在没有对应英文的译文。`]);
        return;
      }
      const key = JSON.stringify([role, source]);
      const rows = parts.get(key) ?? [];
      rows.push({ context: JSON.stringify(context), group, text:    zh[index]!.trim(), write:   value => {
        zh[index] = value;
        pair.zh = zh.join('\n');
      } });
      parts.set(key, rows);
    });
  }
  /** Uses ancestor text rather than numbers so clearly corresponding renumbered rules match. */
  function rule(entry: Edition['main'][number], ancestors: string[]) {
    group(entry.chapter);
    add(entry, /^\d+\.$/.test(entry.chapter) ? 'heading' : 'rule', ancestors, entry.chapter);
    const context = [...ancestors, sourceText(entry.en)];
    entry.extras.forEach(extra => add(extra, extra.en.startsWith('Example:') ? 'example' : 'continuation', context, entry.chapter));
    entry.subrules.forEach(child => rule(child, context));
  }
  data.main.forEach(entry => rule(entry, []));
  data.glossary.forEach(term => {
    group(`词条 ${term.enname}`);
    const name = { en: term.enname, zh: term.zhname };
    add(name, 'term', [], term.enname);
    // The title is stored separately from its body in the repository JSON.
    const title = parts.get(JSON.stringify(['term', sourceText(term.enname)]))!.at(-1)!;
    title.write = value => {
      term.zhname = value;
    };
    add(term, 'definition', [sourceText(term.enname)], term.enname);
  });
  for (const section of ['intro', 'credits'] as const) {
    data[section].contents.forEach(pair => add(pair, section, [], section));
  }
  return parts;
}

/** Selects the newest nonempty wording while preserving independently translated contexts. */
export function latestCrTranslation(content: unknown, editions: unknown[]) {
  const target = parseCrTranslation(content, '当前版本');
  const originals = editionParts(target);
  const candidates = editions.map(content => {
    const data = parseCrTranslation(content, '中文译本');
    return { date: crTranslationEffectiveDate(data, data.version), parts: editionParts(data) };
  }).sort((a, b) => b.date.localeCompare(a.date));

  for (const [key, parts] of originals) {
    for (const part of parts) {
      for (const candidate of candidates) {
        // Missing translations still establish source identity; removing them can make an
        // unrelated occurrence look unique and let it overwrite a valid historical translation.
        const matches = candidate.parts.get(key) ?? [];
        if (matches.length === 0) continue;
        const contextual = matches.filter(row => row.context === part.context);
        const sameGroup = contextual.filter(row => row.group === part.group);
        // Repeated English can mean different things (for example, Exile as a zone or action).
        // Cross-number reuse requires a unique contextual match, or unique source on both sides.
        const selected = sameGroup.length > 0
          ? sameGroup
          : contextual.length > 0
            ? contextual
            : parts.length === 1 && matches.length === 1 ? matches : [];
        if (selected.length === 0) continue;
        const wording = new Set(selected.map(row => row.text));
        if (wording.size === 1 && selected[0]!.text === '') continue;
        if (wording.size === 1) part.write(selected[0]!.text);
        // An ambiguous newer edition cannot justify silently choosing an older wording.
        break;
      }
    }
  }
  return target;
}
