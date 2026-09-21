<template>
  <span v-if="segments">
    <template v-for="(s, i) in segments" :key="i">
      <ruby v-if="s.ruby">{{ s.text }}<rt class="text-[0.55em] font-normal opacity-80">{{ s.ruby }}</rt></ruby>
      <template v-else>{{ s.text }}</template>
    </template>
  </span>
  <span v-else>{{ name }}</span>
</template>

<script setup lang="ts">
import { parseNameRuby, type NameRubySegment } from '#model/magic/name-ruby';

/**
 * Renders a name that may carry a phonetic annotation (ADR 0013): the
 * annotation is parsed into base/reading runs and shown as native `<ruby>`
 * markup. Any annotation whose base runs do not rebuild the name — or that is
 * missing, draft-gated away upstream, or malformed — degrades to the plain
 * name.
 */
const props = defineProps<{
  name:  string;
  ruby?: string | null;
}>();

const segments = computed<NameRubySegment[] | null>(() => {
  if (props.ruby == null || props.ruby === '') return null;
  const parsed = parseNameRuby(props.ruby);
  if (parsed == null) return null;
  return parsed.map(s => s.text).join('') === props.name ? parsed : null;
});
</script>
