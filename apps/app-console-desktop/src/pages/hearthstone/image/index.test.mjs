import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { reactive, ref } from 'vue';

const source = readFileSync(new URL('./index.vue', import.meta.url), 'utf8');
const script = source.split('<script setup lang="ts">')[1].split('</script>')[0];
const ast = ts.createSourceFile('image.ts', script, ts.ScriptTarget.Latest, true);

/** Loads the page's real form and launch callbacks without mounting unrelated UI. */
function loadOperations(scale, version, singleCardMode = 'cardId') {
  const names = new Set(['form', 'buildTaskInput', 'buildSingleCardInput', 'operations']);
  const declarations = ast.statements.filter(node => (
    ts.isFunctionDeclaration(node) && names.has(node.name?.text)
  ) || (
    ts.isVariableStatement(node) && node.declarationList.declarations.some(item => names.has(item.name.getText(ast)))
  ));
  assert.equal(declarations.length, names.size);
  const code = ts.transpileModule(declarations.map(node => node.getText(ast)).join('\n'), {
    compilerOptions: { target: ts.ScriptTarget.ESNext },
  }).outputText;
  return runInNewContext(`${code}\nform.version = version; operations;`, {
    reactive,
    version,
    scale:            ref(scale),
    singleCardMode:   ref(singleCardMode),
    singleCardInput:  ref('CS2_029'),
    // Electron serializes task requests before the runtime receives them.
    startDesktopTask: (taskType, params) => structuredClone({ taskType, params }),
  });
}

for (const scale of ['single', 'batch', 'full']) {
  for (const version of ['latest', 'all', '240397']) {
    test(`${scale} image launches cross IPC with version ${version}`, () => {
      for (const operation of loadOperations(scale, version)) {
        const { taskType, params } = operation.create();
        assert.equal(taskType, 'hearthstone_image_render');
        assert.deepEqual(params.zones, ['hand']);
        assert.deepEqual(params.templates, ['normal', 'battlegrounds']);
        assert.deepEqual(params.premiums, ['normal', 'golden', 'diamond', 'signature']);
        assert.equal(params.lang, 'zhs');
        assert.equal(params.limit, 500);
        assert.equal(params.cardId, scale === 'single' ? 'CS2_029' : undefined);
        assert.equal(params.scanAll, scale === 'full');
        assert.equal(params.outputMode, operation.key === 'download' ? 'download' : undefined);
        assert.equal(params.version, version === '240397' ? 240397 : undefined);
        assert.equal(params.allVersions, version === 'all' ? true : undefined);
      }
    });
  }
}

test('single image launches retain the render hash selection', () => {
  for (const operation of loadOperations('single', 'latest', 'renderHash')) {
    const { params } = operation.create();
    assert.equal(params.renderHash, 'CS2_029');
    assert.equal(params.cardId, undefined);
  }
});
