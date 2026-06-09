<template>
  <div class="overflow-hidden rounded-lg border border-default bg-default">
    <div ref="editorRef" class="h-[560px] w-full" />
  </div>
</template>

<script setup lang="ts">
import type * as Monaco from 'monaco-editor';
import type {
  MonacoJsonEditorRef,
  MonacoJsonEditorValidation,
} from '~/types/monaco-json-editor';

import { onMounted, onUnmounted, ref, shallowRef, watch } from 'vue';

const props = defineProps<{
  modelValue: string;
  schema: Record<string, unknown>;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
  'validationChange': [payload: MonacoJsonEditorValidation];
}>();

/** Monaco editor module loaded on the client. */
type MonacoModule = typeof import('monaco-editor');
/** Monaco editor runtime loaded as one client-side module. */
interface MonacoRuntime {
  monaco: MonacoModule;
}

const modelUri = 'file:///desktop-config.json';
const schemaUri = 'app://desktop-config.schema.json';
let monacoPromise: Promise<MonacoRuntime> | null = null;
let themeObserver: MutationObserver | undefined;
let markersListener: Monaco.IDisposable | undefined;
let changeListener: Monaco.IDisposable | undefined;

const editorRef = ref<HTMLElement | null>(null);
const editor = shallowRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
const model = shallowRef<Monaco.editor.ITextModel | null>(null);

/** Monaco editor module loaded from the package root entry. */
function loadMonaco() {
  if (!monacoPromise) {
    monacoPromise = import('monaco-editor').then(monaco => ({
      monaco,
    }));
  }

  return monacoPromise;
}

/** Current editor theme resolved from the document color mode. */
function getThemeName() {
  return document.documentElement.classList.contains('dark') ? 'vs-dark' : 'vs';
}

/** Monaco editor options built for the desktop config editing experience. */
function createEditorOptions(): Monaco.editor.IStandaloneEditorConstructionOptions {
  return {
    value:                       props.modelValue,
    language:                    'json',
    automaticLayout:             true,
    formatOnPaste:               true,
    formatOnType:                true,
    minimap:                     { enabled: false },
    wordWrap:                    'on',
    lineNumbersMinChars:         3,
    scrollBeyondLastLine:        false,
    quickSuggestions:            { comments: false, other: true, strings: true },
    suggestOnTriggerCharacters:  true,
    tabSize:                     2,
    insertSpaces:                true,
    readOnly:                    props.disabled ?? false,
    bracketPairColorization:     { enabled: true },
    guides:                      { bracketPairs: true, indentation: true },
  };
}

/** JSON schema diagnostics configured for the desktop config model. */
function applySchema(runtime: MonacoRuntime) {
  runtime.monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
    validate:            true,
    allowComments:       false,
    enableSchemaRequest: false,
    schemas:             [
      {
        uri: schemaUri,
        fileMatch: [modelUri],
        schema: props.schema,
      },
    ],
  });
}

/** Validation messages read from the active Monaco JSON model. */
function emitValidation(runtime: MonacoRuntime) {
  if (!model.value) {
    emit('validationChange', {
      hasErrors: false,
      messages:  [],
    });
    return;
  }

  const markers = runtime.monaco.editor
    .getModelMarkers({ resource: model.value.uri })
    .filter(marker => marker.severity >= runtime.monaco.MarkerSeverity.Warning);

  const messages = markers.map(marker => {
    const level = marker.severity === runtime.monaco.MarkerSeverity.Error ? 'Error' : 'Warning';
    return `${level} L${marker.startLineNumber}:${marker.startColumn} ${marker.message}`;
  });

  emit('validationChange', {
    hasErrors: markers.some(marker => marker.severity === runtime.monaco.MarkerSeverity.Error),
    messages,
  });
}

/** Monaco editor theme synchronized with the current document color mode. */
function syncTheme(runtime: MonacoRuntime) {
  runtime.monaco.editor.setTheme(getThemeName());
}

/** Document color mode observed and forwarded into Monaco themes. */
function watchTheme(runtime: MonacoRuntime) {
  syncTheme(runtime);

  themeObserver = new MutationObserver(() => {
    syncTheme(runtime);
  });

  themeObserver.observe(document.documentElement, {
    attributes:      true,
    attributeFilter: ['class'],
  });
}

/** Monaco editor instance created for the desktop config page. */
async function initEditor() {
  if (!editorRef.value) {
    return;
  }

  const runtime = await loadMonaco();
  applySchema(runtime);

  model.value = runtime.monaco.editor.createModel(
    props.modelValue,
    'json',
    runtime.monaco.Uri.parse(modelUri),
  );

  editor.value = runtime.monaco.editor.create(editorRef.value, {
    ...createEditorOptions(),
    model: model.value,
  });

  changeListener = editor.value.onDidChangeModelContent(() => {
    emit('update:modelValue', editor.value?.getValue() ?? '');
  });

  markersListener = runtime.monaco.editor.onDidChangeMarkers(changedResources => {
    if (!model.value) {
      return;
    }

    const currentUri = model.value.uri.toString();
    if (changedResources.some(resource => resource.toString() === currentUri)) {
      emitValidation(runtime);
    }
  });

  watchTheme(runtime);
  emitValidation(runtime);
}

/** Editor document formatted with Monaco's built-in formatter. */
async function formatDocument() {
  await editor.value?.getAction('editor.action.formatDocument')?.run();
}

defineExpose<MonacoJsonEditorRef>({
  formatDocument,
});

watch(() => props.modelValue, value => {
  const current = editor.value?.getValue();

  if (!editor.value || current === value) {
    return;
  }

  editor.value.setValue(value);
});

watch(() => props.schema, async () => {
  const runtime = await loadMonaco();
  applySchema(runtime);
  emitValidation(runtime);
}, { deep: true });

watch(() => props.disabled, value => {
  editor.value?.updateOptions({
    readOnly: value ?? false,
  });
});

onMounted(() => {
  void initEditor();
});

onUnmounted(() => {
  themeObserver?.disconnect();
  markersListener?.dispose();
  changeListener?.dispose();
  editor.value?.dispose();
  model.value?.dispose();
});
</script>
