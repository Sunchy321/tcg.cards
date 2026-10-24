import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';

/** Bundles editor workers locally so JSON diagnostics work without a CDN or Node access. */
export default defineNuxtPlugin(() => {
  self.MonacoEnvironment = {
    getWorker(_moduleId, label) { return label === 'json' ? new JsonWorker() : new EditorWorker(); },
  };
});
