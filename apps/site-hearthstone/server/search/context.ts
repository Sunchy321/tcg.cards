import { inArray } from 'drizzle-orm';
import { db } from '#db/db';
import Parser from '#search/parser';
import { simplify } from '#search/parser/simplify';
import type { Expression } from '#search/parser';
import type { Locale } from '#model/hearthstone/schema/basic';
import { Tag } from '#schema/shared/hearthstone/tag';
import { resolveHearthstoneRawCardTerm } from '../../shared/search/localized-card-terms';

let hashTagToVariantPromise: Promise<Record<string, string>> | null = null;

/** Loads hash aliases only for requests that actually inspect image tags. */
async function getHashTagToVariant(): Promise<Record<string, string>> {
  if (hashTagToVariantPromise != null) return hashTagToVariantPromise;

  hashTagToVariantPromise = (async () => {
    const rows = await db
      .select({ slug: Tag.slug, enumId: Tag.enumId })
      .from(Tag)
      .where(inArray(Tag.slug, ['has-diamond', 'has-signature']));

    const map: Record<string, string> = {};
    for (const row of rows) {
      const variant = row.slug === 'has-diamond' ? 'diamond' : 'signature';
      map[row.slug] = variant;
      map[String(row.enumId)] = variant;
    }
    return map;
  })();

  return hashTagToVariantPromise;
}

/** Identifies the image variant selected by a public query. */
type VariantValue = 'normal' | 'golden' | 'diamond' | 'signature' | 'battlegrounds';

const variantValues: readonly VariantValue[] = ['normal', 'golden', 'diamond', 'signature', 'battlegrounds'];

/** Resolves an image variant from query terms without domain reads for tag-free queries. */
export async function detectVariant(dsl: string, lang: Locale = 'en'): Promise<VariantValue> {
  try {
    const expr = new Parser(dsl).parse();
    const simplified = simplify(expr);

    // Tag-free accelerated searches must not read the domain Tag table.
    const tagToVariant = hasHashCommand(simplified) ? await getHashTagToVariant() : {};
    const variants = new Set<string>();

    /** Collects positive image-variant selectors while preserving existing DSL behavior. */
    const walk = (node: Expression): void => {
      if (node.type === 'not') return;

      if (node.type === 'simple') {
        if (node.qual?.includes('!')) return;

        if (node.cmd === 'hash') {
          const v = tagToVariant[node.args];
          if (v != null) variants.add(v);
        }

        if (node.cmd === 'set') {
          const val = node.args.toLowerCase();
          if (val === 'bgs' || val === 'battlegrounds') variants.add('battlegrounds');
        }
      }

      if (node.type === 'raw' && node.argType === 'id') {
        const cardTerm = resolveHearthstoneRawCardTerm(node.args, lang);
        if (cardTerm === 'golden' || cardTerm === 'diamond' || cardTerm === 'signature') {
          variants.add(cardTerm);
        }
      }

      if (node.type === 'hash') {
        const v = tagToVariant[node.args];
        if (v != null) variants.add(v);
      }

      if (node.type === 'paren') {
        walk(node.expr);
      }

      if (node.type === 'logic') {
        for (const child of node.exprs) walk(child);
      }
    };

    walk(simplified);

    const detected = variants.size === 1 ? [...variants][0] : undefined;
    return variantValues.find(v => v === detected) ?? 'normal';
  } catch {
    return 'normal';
  }
}

/** Visits parsed commands without mistaking text literals for DSL commands. */
function containsCommand(node: Expression, names: ReadonlySet<string>, hash = false): boolean {
  if (node.type === 'simple') {
    return names.has(node.cmd);
  }
  if (node.type === 'hash') {
    return hash;
  }
  if (node.type === 'not' || node.type === 'paren') {
    return containsCommand(node.expr, names, hash);
  }
  if (node.type === 'logic') {
    return node.exprs.some(child => containsCommand(child, names, hash));
  }
  return false;
}

/** Detects explicit hash commands including the hashtag pattern. */
function hasHashCommand(node: Expression): boolean {
  return containsCommand(node, new Set(['hash']), true);
}

/** Gives parsed lang/l conditions priority over the request language parameter. */
export function hasLanguageCommand(dsl: string): boolean {
  return containsCommand(simplify(new Parser(dsl).parse()), new Set(['lang', 'l']));
}
