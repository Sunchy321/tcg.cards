<template>
    <div ref="editorRef" class="code-editor" />
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, useTemplateRef, watch } from 'vue';
import { EditorView, lineNumbers, keymap } from '@codemirror/view';
import { EditorState, type Extension, Compartment } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { tags } from '@lezer/highlight';

interface Props {
    readonly?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
    readonly: false,
});

const modelValue = defineModel<string>({ required: true });

const editorRef = useTemplateRef('editorRef');

let editorView: EditorView | null = null;
const readOnlyCompartment = new Compartment();

// Custom syntax highlighting for deck codes
const deckHighlight = HighlightStyle.define([
    { tag: tags.number, color: '#0088ff', fontWeight: 'bold' },
    { tag: tags.string, color: '#333' },
    { tag: tags.keyword, color: '#ff6600', fontWeight: 'bold' },
]);

const createEditorView = () => {
    if (!editorRef.value) return;

    const extensions: Extension[] = [
        lineNumbers(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        syntaxHighlighting(deckHighlight),
        EditorView.lineWrapping,
        EditorView.theme({
            '&': {
                fontSize:     '14px',
                border:       '1px solid #ccc',
                borderRadius: '4px',
            },
            '.cm-content': {
                fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                minHeight:  '400px',
                padding:    '8px',
            },
            '.cm-gutters': {
                backgroundColor: '#f5f5f5',
                border:          'none',
                borderRight:     '1px solid #ddd',
            },
            '.cm-lineNumbers': {
                color:    '#999',
                minWidth: '40px',
            },
            '.cm-activeLineGutter': {
                backgroundColor: '#e8f4ff',
            },
            '.cm-activeLine': {
                backgroundColor: '#f0f8ff',
            },
        }),
        EditorView.updateListener.of(update => {
            if (update.docChanged) {
                modelValue.value = update.state.doc.toString();
            }
        }),
        readOnlyCompartment.of(props.readonly ? EditorState.readOnly.of(true) : []),
    ];

    editorView = new EditorView({
        state: EditorState.create({
            doc: modelValue.value,
            extensions,
        }),
        parent: editorRef.value,
    });
};

watch(modelValue, newValue => {
    if (!editorView) return;

    const currentValue = editorView.state.doc.toString();
    if (newValue !== currentValue) {
        editorView.dispatch({
            changes: {
                from:   0,
                to:     currentValue.length,
                insert: newValue,
            },
        });
    }
});

watch(() => props.readonly, newReadonly => {
    if (!editorView) return;

    editorView.dispatch({
        effects: readOnlyCompartment.reconfigure(
            newReadonly ? EditorState.readOnly.of(true) : [],
        ),
    });
});

onMounted(() => {
    createEditorView();
});

onUnmounted(() => {
    editorView?.destroy();
});
</script>

<style scoped>
.code-editor {
    width: 100%;
    min-height: 400px;
}
</style>
