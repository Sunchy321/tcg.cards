import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('./definition.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('definition.ts', source, ts.ScriptTarget.Latest, true);
const execute = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'executeImageRenderBlock');
assert.ok(execute);
const code = ts.transpileModule(execute.getText(ast).replace(/^export /, ''), {
  compilerOptions: { target: ts.ScriptTarget.ESNext },
}).outputText;

for (const filters of [{ cardId: 'CS2_029' }, { renderHash: 'hash' }, {}]) {
  test(`counting ${Object.keys(filters)[0] ?? 'batch'} preserves simple-stage database constraints`, async () => {
    const ctx = { filters, totalMissing: 0, planKeys: [] };
    const violations = [];
    const requests = [{ output: { fileName: 'card.png' } }, { output: { fileName: 'card.png' } }];
    const run = runInNewContext(`${code}\nexecuteImageRenderBlock;`, {
      ctxMap:                    new Map([['run', ctx]]),
      getLocalDb:                () => ({}),
      buildDebugRenderRequests:  async () => ({ requests }),
      buildCardIdRenderRequests: async () => ({ requests }),
      buildCardImageMissingPlan: async () => ({ keys: ['one', 'two'] }),
      omit:                      value => value,
    });
    await run({
      taskRunId: 'run',
      block:     { payload: { stageKey: 'counting' } },
      store:     {
        async updateStage(_id, key, patch) {
          // Mirror task_stages_simple_omits_counts_chk at the persistence boundary.
          if (key === 'counting' && (patch.done != null || patch.total != null)) {
            violations.push('task_stages_simple_omits_counts_chk');
            throw new Error('task_stages_simple_omits_counts_chk');
          }
        },
      },
    });
    assert.deepEqual(violations, []);
    assert.equal(ctx.totalMissing, Object.keys(filters).length ? 1 : 2);
  });
}
