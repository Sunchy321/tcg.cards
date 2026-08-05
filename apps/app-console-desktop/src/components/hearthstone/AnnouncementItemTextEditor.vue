<template>
  <div class="relative flex min-h-0 min-w-0 flex-1 flex-col">
    <div ref="editorRef" class="min-h-0 flex-1 overflow-hidden" />

    <div class="shrink-0 border-t px-3 py-1.5 text-xs" :class="statusClass">
      {{ statusText }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { yaml } from '@codemirror/lang-yaml';
import { bracketMatching, defaultHighlightStyle, indentOnInput, syntaxHighlighting } from '@codemirror/language';
import { EditorState, type Extension } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
} from '@codemirror/view';
import { computed, onMounted, onUnmounted, reactive, ref, shallowRef, watch } from 'vue';

import {
  createNameResolver,
  parseItemsYaml,
  type CardSearchResult,
  type ParsedResult,
} from '~/utils/announcement-yaml';

const props = defineProps<{
  modelValue: string;
  search: (name: string) => Promise<CardSearchResult[]>;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
  'parsed': [result: ParsedResult];
}>();

const editorRef = ref<HTMLElement>();
const editorView = shallowRef<EditorView>();
const isDark = ref(false);
const parsed = ref<ParsedResult>({ items: [], errors: [], searches: [] });

/** Queries currently being searched, and queries that resolved to no candidates. */
const searching = reactive(new Set<string>());
const noMatch = reactive(new Set<string>());

const resolver = createNameResolver(props.search);

const MAX_CANDIDATES = 10;

let colorModeObserver: MutationObserver | undefined;
let parseTimer: ReturnType<typeof setTimeout> | null = null;

const statusText = computed(() => {
  if (parsed.value.errors.length > 0) {
    const first = parsed.value.errors[0]!;
    return `✗ 第 ${first.line} 行：${first.message}`;
  }
  const parts: string[] = [];
  if (searching.size > 0) parts.push(`搜索中: ${[...searching].join('、')}`);
  const pending = parsed.value.searches.filter(s => !s.expanded && !noMatch.has(s.query));
  if (pending.length > 0) parts.push(`${pending.length} 个待搜索`);
  const noMatches = parsed.value.searches.filter(s => !s.expanded && noMatch.has(s.query));
  if (noMatches.length > 0) parts.push(`${noMatches.length} 个无匹配`);
  const expanded = parsed.value.searches.filter(s => s.expanded);
  if (expanded.length > 0) parts.push(`${expanded.length} 个已展开，请编辑 cardId`);
  if (parts.length > 0) return `⚠ ${parts.join('；')}`;
  return `✓ ${parsed.value.items.length} 条已同步`;
});

const statusClass = computed(() => {
  if (parsed.value.errors.length > 0) return 'text-error bg-error/10';
  if (searching.size > 0 || parsed.value.searches.length > 0) return 'text-amber-600 bg-amber-50';
  return 'text-emerald-600 bg-emerald-50';
});

function createExtensions(): Extension[] {
  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    history(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    bracketMatching(),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
    yaml(),
    // Constrain the editor to its container so long content scrolls inside it
    // instead of overflowing the page. Without this, .cm-editor is height:auto
    // and grows to the full document height.
    EditorView.theme({
      '&':            { height: '100%' },
      '.cm-scroller': { overflow: 'auto' },
    }),
    ...(isDark.value ? [oneDark] : []),
    EditorView.lineWrapping,
    EditorView.updateListener.of(update => {
      if (update.docChanged) {
        const content = update.state.doc.toString();
        emit('update:modelValue', content);
        scheduleParse(content);
      }
    }),
  ];
}

function initEditor() {
  if (!editorRef.value) return;
  const state = EditorState.create({ doc: props.modelValue, extensions: createExtensions() });
  editorView.value = new EditorView({ state, parent: editorRef.value });
  scheduleParse(props.modelValue);
}

function syncDarkMode() {
  isDark.value = document.documentElement.classList.contains('dark');
}

function setupColorModeObserver() {
  syncDarkMode();
  colorModeObserver = new MutationObserver(() => {
    const wasDark = isDark.value;
    syncDarkMode();
    if (wasDark !== isDark.value && editorView.value) {
      const content = editorView.value.state.doc.toString();
      editorView.value.setState(EditorState.create({ doc: content, extensions: createExtensions() }));
    }
  });
  colorModeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
}

function scheduleParse(text: string) {
  if (parseTimer) clearTimeout(parseTimer);
  parseTimer = setTimeout(() => runParse(text), 200);
}

const MAX_CONCURRENT_SEARCHES = 4;

/** Parses the current text, emits the result, and starts card searches in batches. */
function runParse(text: string) {
  const result = parseItemsYaml(text);
  parsed.value = result;
  emit('parsed', result);
  const pending = result.searches.filter(
    s => !s.expanded && !searching.has(s.query) && !noMatch.has(s.query),
  );
  const capacity = MAX_CONCURRENT_SEARCHES - searching.size;
  for (const search of pending.slice(0, Math.max(0, capacity))) {
    void runSearch(search.query);
  }
}

/** Searches one `cardId: name:<query>` trigger and expands its candidates. */
async function runSearch(query: string) {
  searching.add(query);
  try {
    const candidates = await resolver(query);
    expand(query, candidates);
  } finally {
    searching.delete(query);
  }
}

/** Appends the top candidates onto the matching `cardId: name:<query>` value. */
function expand(query: string, candidates: CardSearchResult[]) {
  const view = editorView.value;
  if (!view) return;
  const text = view.state.doc.toString();
  const result = parseItemsYaml(text);
  const trigger = result.searches.find(s => s.query === query && !s.expanded);
  if (!trigger) return;
  const list = candidates.slice(0, MAX_CANDIDATES).map(c => c.cardId).join(',');
  if (!list) {
    noMatch.add(query);
    return;
  }
  view.dispatch({ changes: { from: trigger.from, to: trigger.to, insert: `name:${query} result:${list}` } });
}

watch(() => props.modelValue, value => {
  const current = editorView.value?.state.doc.toString();
  if (!editorView.value || current === value) return;
  editorView.value.dispatch({ changes: { from: 0, to: current?.length ?? 0, insert: value } });
});

onMounted(() => {
  setupColorModeObserver();
  initEditor();
});

onUnmounted(() => {
  colorModeObserver?.disconnect();
  editorView.value?.destroy();
  if (parseTimer) clearTimeout(parseTimer);
});
</script>
