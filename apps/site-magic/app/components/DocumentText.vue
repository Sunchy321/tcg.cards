<template>
  <render />
</template>

<script setup lang="ts">
import { h, type VNodeChild } from 'vue';
import { NuxtLink } from '#components';
import type { TextMarker } from '#model/magic/schema/document-content';
import { symbols } from '#model/magic/schema/basic';
import MagicSymbol from './Symbol.vue';
import MagicCardAvatar from './CardAvatar.vue';

const props = defineProps<{ text: string, markers?: TextMarker[], slug: string, versionTag: string }>();

/** Renders literal game symbols without interpreting plain text as Markdown or HTML. */
function symbolText(text: string): VNodeChild[] {
  const result: VNodeChild[] = [];
  let previous = 0;
  for (const match of text.matchAll(/\{([^{}]+)\}/g)) {
    if (!symbols.includes(match[1]!)) continue;
    result.push(text.slice(previous, match.index), h(MagicSymbol, { value: match[0] }));
    previous = match.index + match[0].length;
  }
  result.push(text.slice(previous));
  return result;
}

/** Applies semantic annotations to independently escaped text segments. */
function render() {
  const markers = (props.markers ?? []).filter(marker => marker.start >= 0 && marker.end <= props.text.length && marker.end > marker.start);
  const boundaries = [...new Set([0, props.text.length, ...markers.flatMap(marker => [marker.start, marker.end])])].sort((a, b) => a - b);
  const result: VNodeChild[] = [];
  for (let index = 0; index < boundaries.length - 1; index++) {
    const start = boundaries[index]!;
    const end = boundaries[index + 1]!;
    const active = markers.filter(marker => marker.start <= start && marker.end >= end);
    const text = props.text.slice(start, end);
    const card = active.find(marker => marker.type === 'card');
    let children: VNodeChild = card?.type === 'card'
      ? h(MagicCardAvatar, { id: card.cardId.split('/')[0]!, part: card.cardId.includes('/') ? Number(card.cardId.split('/')[1]) : undefined, text })
      : symbolText(text);
    for (const marker of active) {
      if (marker.type === 'emphasis') children = h(marker.style === 'strong' ? 'strong' : marker.style === 'strike' ? 's' : 'em', {}, children);
    }
    const link = active.find(marker => marker.type === 'link' || marker.type === 'chapter');
    if (link?.type === 'link' && /^(https?:|mailto:)/i.test(link.href)) children = h('a', { href: link.href, rel: 'noopener noreferrer' }, children);
    if (link?.type === 'chapter') {
      const label = children;
      const document = link.documentId ?? props.slug;
      children = h(NuxtLink, { to: {
        path:  `/document/${document === 'magic-cr' ? 'cr' : document}`,
        query: { version: link.releaseId ?? props.versionTag, node: link.anchor },
        hash:  `#${encodeURIComponent(link.anchor)}`,
      } }, () => label);
    }
    result.push(children);
  }
  return h('span', {}, result);
}
</script>
