<template>
  <div ref="editorRef" class="overflow-hidden rounded-lg border border-default bg-default" :style="{ height }" />
</template>

<script setup lang="ts">
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { yaml } from '@codemirror/lang-yaml';
import { bracketMatching, defaultHighlightStyle, indentOnInput, syntaxHighlighting } from '@codemirror/language';
import { EditorState, type Extension } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from '@codemirror/view';

import { onMounted, onUnmounted, ref, shallowRef, watch } from 'vue';

const props = defineProps<{
  modelValue: string;
  height?: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const height = props.height ?? '320px';

const editorRef = ref<HTMLElement | null>(null);
const editorView = shallowRef<EditorView | null>(null);
const isDark = ref(false);

function syncDarkMode() {
  isDark.value = document.documentElement.classList.contains('dark');
}

function createExtensions(): Extension[] {
  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    history(),
    indentOnInput(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    bracketMatching(),
    highlightActiveLine(),
    keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
    yaml(),
    // Keep the editor constrained to its container so long content scrolls inside it.
    EditorView.theme({
      '&':            { height: '100%' },
      '.cm-scroller': { overflow: 'auto' },
    }),
    ...(isDark.value ? [oneDark] : []),
    EditorView.lineWrapping,
    EditorView.updateListener.of(update => {
      if (update.docChanged) emit('update:modelValue', update.state.doc.toString());
    }),
  ];
}

let colorModeObserver: MutationObserver | undefined;

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

onMounted(() => {
  if (!editorRef.value) return;
  editorView.value = new EditorView({
    state: EditorState.create({ doc: props.modelValue, extensions: createExtensions() }),
    parent: editorRef.value,
  });
  setupColorModeObserver();
});

onUnmounted(() => {
  colorModeObserver?.disconnect();
  editorView.value?.destroy();
});

watch(() => props.modelValue, value => {
  const view = editorView.value;
  if (!view) return;
  const current = view.state.doc.toString();
  if (current === value) return;
  view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
});
</script>
