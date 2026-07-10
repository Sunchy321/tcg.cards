import { describe, expect, test } from 'bun:test';

import {
  getTaskDefinition,
  listTaskDefinitions,
  registerTaskDefinition,
} from './registry';
import type { TaskDefinition, TaskRunInput, TaskStageState } from './definition';

/** A minimal task definition for use in registry tests. */
function fakeDefinition(taskType: string): TaskDefinition {
  return {
    taskType,
    definitionVersion: 'v1',
    supportsResume: false,
    effectModel: 'atomic',
    buildStagePlan(_input: TaskRunInput) {
      return [];
    },
    prepareStageEntry({ stage }: { run: TaskRunInput; stage: TaskStageState; resume: boolean }) {
      return {
        stageKey: stage.stageKey,
        stageIndex: stage.stageIndex,
        progressMode: stage.progressMode,
        resumeMode: stage.resumeMode,
        total: stage.total,
      };
    },
    buildBlocks() {
      return [];
    },
    executeBlock() {},
  };
}

describe('registry', () => {
  test('registers and retrieves one definition by task type', () => {
    const def = fakeDefinition('my_task');
    registerTaskDefinition(def);

    const retrieved = getTaskDefinition('my_task');
    expect(retrieved).toBe(def);
  });

  test('overwrites a previously registered definition silently', () => {
    const def1 = fakeDefinition('overwrite_task');
    const def2 = fakeDefinition('overwrite_task');

    registerTaskDefinition(def1);
    registerTaskDefinition(def2);

    expect(getTaskDefinition('overwrite_task')).toBe(def2);
  });

  test('lists all currently registered definitions', () => {
    const a = fakeDefinition('list_a');
    const b = fakeDefinition('list_b');
    registerTaskDefinition(a);
    registerTaskDefinition(b);

    const all = listTaskDefinitions();
    expect(all).toContain(a);
    expect(all).toContain(b);
  });

  test('throws when retrieving an unregistered definition', () => {
    expect(() => getTaskDefinition('nonexistent')).toThrow(
      'Task definition is not registered for task type "nonexistent"',
    );
  });
});
