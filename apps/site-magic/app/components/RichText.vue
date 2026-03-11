<template>
  <render />
</template>

<script setup lang="ts">
import type { VNode } from 'vue';
import { h } from 'vue';
import type Token from 'markdown-it/lib/token.mjs';
import type StateInline from 'markdown-it/lib/rules_inline/state_inline.mjs';
import type StateBlock from 'markdown-it/lib/rules_block/state_block.mjs';
import MarkdownIt from 'markdown-it';

import MagicSymbol from './Symbol.vue';
import MagicCardAvatar from './CardAvatar.vue';

import { symbols } from '#model/magic/schema/basic';

const props = withDefaults(defineProps<{
  symbol?:     string[];
  lang?:       string;
  inline?:     boolean;
  detectUrl?:  boolean;
  detectEmph?: boolean;
  detectCr?:   boolean;
}>(), {
  symbol:     () => [],
  lang:       undefined,
  inline:     false,
  detectUrl:  false,
  detectEmph: false,
  detectCr:   false,
});

const slots = defineSlots<{
  default: () => any[];
}>();

defineOptions({ inheritAttrs: false });
const attrs = useAttrs();

const gameLocale = useGameLocale('magic');
const lang = computed(() => props.lang ?? gameLocale.value);

// ── markdown-it setup ──────────────────────────────────────────────────────

const md = new MarkdownIt({
  html:    true,
  linkify: props.detectUrl,
  breaks:  true,
});

// Magic symbols: {T}, {W}, {1} and loyalty counters [+1], [-X], [0]
md.inline.ruler.before('escape', 'magic_symbol', (state: StateInline, silent: boolean) => {
  const pos = state.pos;
  const src = state.src;

  if (src[pos] === '{') {
    const closePos = src.indexOf('}', pos + 1);
    if (closePos !== -1) {
      const content = src.slice(pos + 1, closePos);
      if (symbols.includes(content)) {
        if (!silent) {
          const token = state.push('magic_symbol', '', 0);
          token.content = src.slice(pos, closePos + 1);
        }
        state.pos = closePos + 1;
        return true;
      }
    }
  }

  if (src[pos] === '[') {
    const closePos = src.indexOf(']', pos + 1);
    if (closePos !== -1) {
      const content = src.slice(pos + 1, closePos);
      if (/^(?:0|[+-](?:[1-9][0-9]*|X|N))$/.test(content)) {
        if (!silent) {
          const token = state.push('magic_symbol', '', 0);
          token.content = src.slice(pos, closePos + 1);
        }
        state.pos = closePos + 1;
        return true;
      }
    }
  }

  return false;
});

// Card links: @card(id){text}
md.inline.ruler.before('escape', 'card_link', (state: StateInline, silent: boolean) => {
  const pos = state.pos;
  const src = state.src;

  if (src.slice(pos, pos + 6) !== '@card(') {
    return false;
  }

  const match = /@card\((.*?)\)\{(.*?)\}/.exec(src.slice(pos));
  if (!match) {
    return false;
  }

  if (!silent) {
    const token = state.push('card_link', '', 0);
    token.meta = { id: match[1], text: match[2] };
  }

  state.pos = pos + match[0].length;
  return true;
});

// Checkboxes: ☐
md.inline.ruler.before('escape', 'checkbox', (state: StateInline, silent: boolean) => {
  if (state.src[state.pos] === '☐') {
    if (!silent) {
      state.push('checkbox', '', 0);
    }
    state.pos += 1;
    return true;
  }
  return false;
});

// Copyable dividers: ====================
md.block.ruler.before('hr', 'copyable_hr', (state: StateBlock, startLine: number, _endLine: number, silent: boolean) => {
  const pos = state.bMarks[startLine]! + state.tShift[startLine]!;
  const max = state.eMarks[startLine]!;
  const line = state.src.slice(pos, max);

  if (!/^={20,}$/.test(line)) {
    return false;
  }

  if (silent) {
    return true;
  }

  state.line = startLine + 1;
  const token = state.push('copyable_hr', 'div', 0);
  token.map = [startLine, state.line];
  token.markup = line;
  return true;
});

// ── token → VNode conversion ───────────────────────────────────────────────

function tokensToVNodes(tokens: Token[]): (VNode | string)[] {
  const result: (VNode | string)[] = [];
  const symbolType = props.symbol ?? [];
  const insertedCards: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;

    if (token.type === 'magic_symbol') {
      result.push(h(MagicSymbol, {
        value: token.content,
        type:  symbolType,
      }));
      continue;
    }

    if (token.type === 'card_link') {
      const { id, text } = token.meta as { id: string, text: string };
      const [cardId, partIndexText] = id.split('/');
      const partIndex = partIndexText ? parseInt(partIndexText, 10) : undefined;
      const repeated = insertedCards.includes(cardId!);

      if (!repeated) {
        result.push(h(MagicCardAvatar, {
          class: 'magic-text card',
          id:    cardId!,
          part:  partIndex,
          text,
        }));
      } else {
        result.push(h('span', { class: 'magic-text card repeated' }, text));
      }

      insertedCards.push(cardId!);
      continue;
    }

    if (token.type === 'checkbox') {
      result.push(h('input', {
        type:  'checkbox',
        style: 'vertical-align: middle; transform: translateY(-10%)',
      }));
      continue;
    }

    if (token.type === 'copyable_hr') {
      result.push(h('div', { class: 'copyable-hr' }));
      continue;
    }

    if (token.type === 'hr') {
      result.push(h('hr'));
      continue;
    }

    if (token.type === 'text') {
      result.push(token.content);
      continue;
    }

    if (token.type === 'softbreak' || token.type === 'hardbreak') {
      result.push(h('br'));
      continue;
    }

    if (token.type === 'inline' && token.children) {
      result.push(...tokensToVNodes(token.children));
      continue;
    }

    if (token.type.endsWith('_open')) {
      const closeIdx = tokens.findIndex((t, idx) => idx > i && t.type === token.type.replace('_open', '_close'));
      const children = tokensToVNodes(tokens.slice(i + 1, closeIdx));

      const attrs: Record<string, any> = {};
      const href = token.attrGet('href');
      const target = token.attrGet('target');
      if (href) attrs.href = href;
      if (target) attrs.target = target;

      result.push(h(token.tag, attrs, children));
      i = closeIdx;
      continue;
    }

    if (token.type.endsWith('_close')) {
      continue;
    }

    if (token.type === 'paragraph_open') {
      const closeIdx = tokens.findIndex((t, idx) => idx > i && t.type === 'paragraph_close');
      const children = tokensToVNodes(tokens.slice(i + 1, closeIdx));
      result.push(h('p', children));
      i = closeIdx;
      continue;
    }
  }

  return result;
}

// ── render ─────────────────────────────────────────────────────────────────

const render = () => {
  const defaultSlot = slots.default?.();
  if (!defaultSlot || defaultSlot.length === 0) {
    return [];
  }

  let text = '';
  for (const node of defaultSlot) {
    if (typeof node === 'string') {
      text += node;
    } else if (node.children && typeof node.children === 'string') {
      text += node.children;
    } else if (typeof node.children === 'object' && node.children !== null) {
      text += String(node.children);
    }
  }

  const tokens = props.inline
    ? md.parseInline(text, {})
    : md.parse(text, {});

  const vnodes = tokensToVNodes(tokens);
  const tag = props.inline ? 'span' : 'div';
  return h(tag, attrs, vnodes);
};

// expose lang so consumers can reference it (e.g. for [lang] attr on parent)
defineExpose({ lang });
</script>

<style>
.magic-text.card {
  display: inline;
  text-decoration: underline;
}

.magic-text.card.repeated {
  display: inline;
  text-decoration: dashed underline;
}

.magic-text-title {
  font-weight: bold;
  margin-right: 5px;
}

.copyable-hr {
  position: relative;
  height: 1px;
  background: #ccc;
  margin: 1em 0;
  user-select: all;
}

.copyable-hr::before {
  content: '====================';
  position: absolute;
  left: 0;
  right: 0;
  color: transparent;
  user-select: all;
  pointer-events: none;
}
</style>
