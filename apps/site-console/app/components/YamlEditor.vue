<template>
  <div class="relative flex-1 flex flex-col min-h-0">
    <!-- YAML Error Banner -->
    <div
      v-if="error"
      class="px-4 py-2 bg-error-50 dark:bg-error-900/20 text-error-600 dark:text-error-400 text-sm border-b border-error-200 dark:border-error-800"
    >
      {{ error }}
    </div>

    <!-- Editor Container -->
    <div ref="editorRef" class="flex-1 overflow-hidden" />

    <!-- Context Menu -->
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
        class="absolute z-50 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 min-w-40"
        :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
      >
        <div class="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700 truncate max-w-60">
          {{ contextMenu.url }}
        </div>
        <button
          class="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
          @click="handleOpenLink"
        >
          <UIcon name="i-lucide-external-link" class="size-4" />
          <span>跳转</span>
        </button>
        <button
          class="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
          @click="handleCopyLink"
        >
          <UIcon name="i-lucide-copy" class="size-4" />
          <span>复制</span>
        </button>
        <button
          class="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
          @click="handleOpenNewTab"
        >
          <UIcon name="i-lucide-plus-square" class="size-4" />
          <span>新标签页打开</span>
        </button>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, shallowRef, watch, onMounted, onUnmounted } from 'vue';
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection, dropCursor, rectangularSelection, crosshairCursor, highlightActiveLine } from '@codemirror/view';
import { EditorState, StateEffect, type Extension } from '@codemirror/state';
import { indentOnInput, syntaxHighlighting, defaultHighlightStyle, bracketMatching } from '@codemirror/language';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { yaml } from '@codemirror/lang-yaml';
import { oneDark } from '@codemirror/theme-one-dark';
import { isScalar, isSeq, parseDocument, visit } from 'yaml';

const props = defineProps<{
  modelValue: string;
  error?:     string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const editorRef = ref<HTMLElement>();
const editorView = shallowRef<EditorView>();

// Context menu state
const contextMenu = ref({
  show: false,
  x:    0,
  y:    0,
  url:  '',
});

// Link ranges in the document
interface LinkRange {
  from: number;
  to:   number;
  url:  string;
}

const linkRanges = ref<LinkRange[]>([]);

// Parse YAML and extract link ranges
function parseLinkRanges(content: string): LinkRange[] {
  const ranges: LinkRange[] = [];

  try {
    const doc = parseDocument(content);
    const contentStr = content;

    visit(doc, {
      Pair(_, pair, _path) {
        // Check if this is a "link" key
        if (isScalar(pair.key) && pair.key.value === 'link' && isSeq(pair.value)) {
          // Find the position of "link:" in the source
          const linkKeyIndex = contentStr.indexOf('link:');
          if (linkKeyIndex === -1) return;

          // Find all URLs after "link:"
          const searchStart = linkKeyIndex + 5;
          const linkSection = contentStr.slice(searchStart);

          // Find array items - look for "- " patterns followed by URLs
          const urlRegex = /-\s+(https?:\/\/[^\s\n]+)/g;
          let match;

          while ((match = urlRegex.exec(linkSection)) !== null) {
            const url = match[1]!;
            const urlStart = searchStart + match.index + 2; // +2 for "- "
            const urlEnd = urlStart + url.length;

            ranges.push({
              from: urlStart,
              to:   urlEnd,
              url,
            });
          }
        }
      },
    });
  } catch {
    // YAML parse error, ignore
  }

  return ranges;
}

// Update link ranges when content changes
function updateLinkRanges(content: string) {
  linkRanges.value = parseLinkRanges(content);
}

// Check if cursor is in a link range and show context menu
function checkCursorPosition(view: EditorView) {
  const selection = view.state.selection.main;
  const cursorPos = selection.head;

  const link = linkRanges.value.find(
    r => cursorPos >= r.from && cursorPos <= r.to,
  );

  if (link) {
    // Calculate position for context menu (above the cursor)
    const coords = view.coordsAtPos(link.from);
    if (coords) {
      const editorRect = editorRef.value?.getBoundingClientRect();
      if (editorRect) {
        contextMenu.value = {
          show: true,
          x:    coords.left - editorRect.left,
          y:    coords.top - editorRect.top - 10, // 10px above
          url:  link.url,
        };
      }
    }
  } else {
    hideContextMenu();
  }
}

function hideContextMenu() {
  contextMenu.value.show = false;
}

// Handle actions
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

function handleOpenNewTab() {
  if (contextMenu.value.url) {
    window.open(contextMenu.value.url, '_blank');
  }
  hideContextMenu();
}

// Create editor extensions
function createExtensions(): Extension[] {
  const isDark = document.documentElement.classList.contains('dark');

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
    isDark ? oneDark : [],
    EditorView.lineWrapping,
    EditorView.updateListener.of(update => {
      if (update.docChanged) {
        const newContent = update.state.doc.toString();
        emit('update:modelValue', newContent);
        updateLinkRanges(newContent);
      }

      // Check cursor position on selection change
      if (update.selectionSet) {
        checkCursorPosition(update.view);
      }
    }),
    EditorView.domEventHandlers({
      blur: () => {
        // Delay hiding to allow clicking the menu
        setTimeout(() => hideContextMenu(), 200);
      },
    }),
  ];
}

// Initialize editor
function initEditor() {
  if (!editorRef.value) return;

  const state = EditorState.create({
    doc:        props.modelValue,
    extensions: createExtensions(),
  });

  const view = new EditorView({
    state,
    parent: editorRef.value,
  });

  editorView.value = view;
  updateLinkRanges(props.modelValue);
}

// Watch for external content changes
watch(
  () => props.modelValue,
  newValue => {
    const view = editorView.value;
    if (!view) return;

    const currentContent = view.state.doc.toString();
    if (newValue !== currentContent) {
      view.dispatch({
        changes: { from: 0, to: currentContent.length, insert: newValue },
      });
      updateLinkRanges(newValue);
    }
  },
);

// Watch for dark mode changes
watch(
  () => document.documentElement.classList.contains('dark'),
  () => {
    const view = editorView.value;
    if (!view) return;

    view.dispatch({
      effects: StateEffect.reconfigure.of(createExtensions()),
    });
  },
);

onMounted(() => {
  initEditor();
});

onUnmounted(() => {
  editorView.value?.destroy();
});
</script>

<style>
/* Ensure CodeMirror takes full height */
.cm-editor {
  height: 100%;
}

.cm-editor.cm-focused {
  outline: none;
}

/* Style link ranges */
.cm-link-range {
  background: rgba(37, 99, 235, 0.15);
  border-radius: 2px;
}

.dark .cm-link-range {
  background: rgba(96, 165, 250, 0.2);
}
</style>
