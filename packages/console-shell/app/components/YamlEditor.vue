<template>
  <div class="relative flex min-h-0 flex-1 flex-col">
    <div
      v-if="error"
      class="border-b border-error/30 bg-error/10 px-4 py-2 text-sm text-error"
    >
      {{ error }}
    </div>

    <div ref="editorRef" class="flex-1 overflow-hidden" />

    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 translate-y-2"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 translate-y-2"
    >
      <div
        v-if="contextMenu.show"
        class="absolute z-50 min-w-40 rounded-lg border border-default bg-default py-1 shadow-lg"
        :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
      >
        <div class="max-w-60 truncate border-b border-default px-3 py-2 text-xs text-muted">
          {{ contextMenu.url }}
        </div>
        <button
          class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-elevated"
          @click="handleOpenLink"
        >
          <UIcon name="i-lucide-external-link" class="size-4" />
          <span>跳转</span>
        </button>
        <button
          class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-elevated"
          @click="handleCopyLink"
        >
          <UIcon name="i-lucide-copy" class="size-4" />
          <span>复制</span>
        </button>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { yaml } from '@codemirror/lang-yaml';
import { bracketMatching, defaultHighlightStyle, indentOnInput, syntaxHighlighting } from '@codemirror/language';
import { EditorState, StateEffect, type Extension } from '@codemirror/state';
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
import { onMounted, onUnmounted, ref, shallowRef, watch } from 'vue';
import { isScalar, isSeq, parseDocument, visit } from 'yaml';

const props = defineProps<{
  modelValue: string;
  error?: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const editorRef = ref<HTMLElement>();
const editorView = shallowRef<EditorView>();
const isDark = ref(false);

const contextMenu = ref({
  show: false,
  x: 0,
  y: 0,
  url: '',
});

interface LinkRange {
  from: number;
  to: number;
  url: string;
}

const linkRanges = ref<LinkRange[]>([]);
let colorModeObserver: MutationObserver | undefined;

function parseLinkRanges(content: string): LinkRange[] {
  const ranges: LinkRange[] = [];

  try {
    const doc = parseDocument(content);

    visit(doc, {
      Pair(_, pair) {
        if (isScalar(pair.key) && pair.key.value === 'link' && isSeq(pair.value)) {
          const linkKeyIndex = content.indexOf('link:');
          if (linkKeyIndex === -1) return;

          const searchStart = linkKeyIndex + 5;
          const linkSection = content.slice(searchStart);
          const urlRegex = /-\s+(https?:\/\/[^\s\n]+)/g;
          let match: RegExpExecArray | null;

          while ((match = urlRegex.exec(linkSection)) !== null) {
            const url = match[1];
            if (!url) continue;

            const urlStart = searchStart + match.index + 2;
            const urlEnd = urlStart + url.length;

            ranges.push({
              from: urlStart,
              to: urlEnd,
              url,
            });
          }
        }
      },
    });
  } catch {
    // Ignore invalid YAML while editing.
  }

  return ranges;
}

function updateLinkRanges(content: string) {
  linkRanges.value = parseLinkRanges(content);
}

function checkCursorPosition(view: EditorView) {
  const cursorPos = view.state.selection.main.head;
  const link = linkRanges.value.find(range => cursorPos >= range.from && cursorPos <= range.to);

  if (!link) {
    hideContextMenu();
    return;
  }

  const coords = view.coordsAtPos(link.from);
  const editorRect = editorRef.value?.getBoundingClientRect();

  if (!coords || !editorRect) {
    hideContextMenu();
    return;
  }

  contextMenu.value = {
    show: true,
    x: coords.left - editorRect.left,
    y: coords.top - editorRect.top - 10,
    url: link.url,
  };
}

function hideContextMenu() {
  contextMenu.value.show = false;
}

function handleOpenLink() {
  if (contextMenu.value.url) {
    window.open(contextMenu.value.url, '_blank');
  }

  hideContextMenu();
}

function handleCopyLink() {
  if (contextMenu.value.url) {
    navigator.clipboard.writeText(contextMenu.value.url);
  }

  hideContextMenu();
}

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
    ...(isDark.value ? [oneDark] : []),
    EditorView.lineWrapping,
    EditorView.updateListener.of(update => {
      if (update.docChanged) {
        const newContent = update.state.doc.toString();
        emit('update:modelValue', newContent);
        updateLinkRanges(newContent);
      }

      if (update.selectionSet) {
        checkCursorPosition(update.view);
      }
    }),
    EditorView.domEventHandlers({
      blur: () => {
        window.setTimeout(() => hideContextMenu(), 200);
      },
    }),
  ];
}

function initEditor() {
  if (!editorRef.value) return;

  const state = EditorState.create({
    doc: props.modelValue,
    extensions: createExtensions(),
  });

  editorView.value = new EditorView({
    state,
    parent: editorRef.value,
  });

  updateLinkRanges(props.modelValue);
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
      const state = EditorState.create({
        doc: content,
        extensions: createExtensions(),
      });

      editorView.value.setState(state);
    }
  });

  colorModeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  });
}

watch(() => props.modelValue, (value) => {
  if (!editorView.value) return;

  const current = editorView.value.state.doc.toString();
  if (current !== value) {
    const transaction = editorView.value.state.update({
      changes: {
        from: 0,
        to: current.length,
        insert: value,
      },
      effects: StateEffect.reconfigure.of(createExtensions()),
    });

    editorView.value.dispatch(transaction);
  }
});

onMounted(() => {
  setupColorModeObserver();
  initEditor();
});

onUnmounted(() => {
  colorModeObserver?.disconnect();
  editorView.value?.destroy();
});
</script>
