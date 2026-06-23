import type { TaskDefinition } from './definition';

const taskDefinitions = new Map<string, TaskDefinition>();

/** Registers one task definition under its stable task type. */
export function registerTaskDefinition(definition: TaskDefinition): void {
  taskDefinitions.set(definition.taskType, definition);
}

/** Returns one task definition for the requested task type. */
export function getTaskDefinition(taskType: string): TaskDefinition {
  const definition = taskDefinitions.get(taskType);

  if (!definition) {
    throw new Error(`Task definition is not registered for task type "${taskType}"`);
  }

  return definition;
}

/** Lists all currently registered task definitions. */
export function listTaskDefinitions(): TaskDefinition[] {
  return [...taskDefinitions.values()];
}
