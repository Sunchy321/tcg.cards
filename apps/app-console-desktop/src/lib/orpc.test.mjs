import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('./orpc.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('orpc.ts', source, ts.ScriptTarget.Latest, true);
const declaration = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'startDesktopTask');
const code = ts.transpileModule(declaration.getText(ast).replace('export ', ''), {
  compilerOptions: { target: ts.ScriptTarget.ESNext },
}).outputText;
const snapshot = { pageTask: { kind: 'attached', taskRunId: 'run-1', status: 'pending' }, stages: [] };

/** Executes the real launch helper with controlled host replies and push timing. */
function setup(start, get = async () => null) {
  const listeners = new Set();
  const push = task => listeners.forEach(listener => listener(task));
  const launch = runInNewContext(`${code}\nstartDesktopTask;`, {
    window: { desktop: { tasks: {
      start:    () => start(push),
      get,
      onChange: listener => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    } } },
  });
  return { launch: () => launch('hearthstone_reference_publish', {}), listeners, push };
}

test('confirmed publish waits for the saved page snapshot after early acceptance', async () => {
  const host = setup(async push => {
    setTimeout(() => push({ id: 'run-1', pageSnapshot: snapshot }), 5);
    return { taskRunId: 'run-1', existing: false };
  });
  assert.deepEqual(await host.launch(), snapshot);
  assert.equal(host.listeners.size, 0);
});

test('keeps a snapshot pushed before the start reply', async () => {
  const host = setup(async push => {
    push({ id: 'run-1', pageSnapshot: snapshot });
    return { taskRunId: 'run-1', existing: false };
  });
  assert.deepEqual(await host.launch(), snapshot);
  assert.equal(host.listeners.size, 0);
});

test('reports creation failure pushed without a persisted page snapshot', async () => {
  const host = setup(async push => {
    setTimeout(() => push({ id: 'run-1', status: 'failed', errorMessage: 'publish creation failed' }), 5);
    return { taskRunId: 'run-1', existing: false };
  });
  await assert.rejects(host.launch(), /publish creation failed/);
  assert.equal(host.listeners.size, 0);
});

test('canceling confirmation releases the launch listener', async () => {
  const host = setup(async () => null);
  assert.equal(await host.launch(), null);
  assert.equal(host.listeners.size, 0);
});

test('an existing saved run attaches immediately', async () => {
  const host = setup(async () => ({ taskRunId: 'run-1', existing: true }), async () => ({ id: 'run-1', pageSnapshot: snapshot }));
  assert.deepEqual(await host.launch(), snapshot);
  assert.equal(host.listeners.size, 0);
});

test('an acceptance push does not hide the saved snapshot', async () => {
  const host = setup(async push => {
    push({ id: 'run-1', status: 'pending', phase: 'accepted' });
    return { taskRunId: 'run-1', existing: false };
  }, async () => ({ id: 'run-1', pageSnapshot: snapshot }));
  assert.deepEqual(await host.launch(), snapshot);
  assert.equal(host.listeners.size, 0);
});

test('ignores updates for unrelated runs while waiting for persistence', async () => {
  const host = setup(async push => {
    setTimeout(() => {
      push({ id: 'other', status: 'failed', errorMessage: 'unrelated' });
      push({ id: 'run-1', status: 'pending', phase: 'saving' });
      push({ id: 'run-1', pageSnapshot: snapshot });
    }, 5);
    return { taskRunId: 'run-1', existing: false };
  });
  assert.deepEqual(await host.launch(), snapshot);
  assert.equal(host.listeners.size, 0);
});

test('captures a failure pushed before the start reply', async () => {
  const host = setup(async push => {
    push({ id: 'run-1', status: 'failed', errorMessage: 'early creation failure' });
    return { taskRunId: 'run-1', existing: false };
  });
  await assert.rejects(host.launch(), /early creation failure/);
  assert.equal(host.listeners.size, 0);
});

test('releases the listener when launch IPC rejects', async () => {
  const host = setup(async () => {
    throw new Error('launch rejected');
  });
  await assert.rejects(host.launch(), /launch rejected/);
  assert.equal(host.listeners.size, 0);
});

test('releases the listener when reading the saved task rejects', async () => {
  const host = setup(async () => ({ taskRunId: 'run-1', existing: false }), async () => {
    throw new Error('read rejected');
  });
  await assert.rejects(host.launch(), /read rejected/);
  assert.equal(host.listeners.size, 0);
});
