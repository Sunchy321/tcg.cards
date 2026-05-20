import 'monaco-editor/min/vs/editor/editor.main.css';

import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';

const monacoGlobal = globalThis as typeof globalThis & {
  MonacoEnvironment?: {
    getWorker: (moduleId: string, label: string) => Worker;
  };
};

/** Monaco worker resolved for one language label. */
function getMonacoWorker(_moduleId: string, label: string): Worker {
  if (label === 'json') {
    return new JsonWorker();
  }

  return new EditorWorker();
}

if (!monacoGlobal.MonacoEnvironment) {
  monacoGlobal.MonacoEnvironment = {
    getWorker: getMonacoWorker,
  };
}

export default defineNuxtPlugin(() => {
});
