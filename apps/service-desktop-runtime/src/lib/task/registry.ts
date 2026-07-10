import type { TaskDefinition, AnyTaskDefinition } from './definition';

const taskDefinitions = new Map<string, TaskDefinition>();

/** Registers one task definition under its stable task type. */
export function registerTaskDefinition(definition: TaskDefinition): void {
  taskDefinitions.set(definition.taskType, definition);
}

/** Registers a typed task definition. */
export function registerTypedTaskDefinition(definition: AnyTaskDefinition): void {
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

/** Returns a typed task definition for the requested task type. */
export function getTypedTaskDefinition(taskType: string): AnyTaskDefinition {
  const def = getTaskDefinition(taskType);
  // AnyTaskDefinition is structurally compatible with TaskDefinition
  return def as unknown as AnyTaskDefinition;
}

/** Lists all currently registered task definitions. */
export function listTaskDefinitions(): TaskDefinition[] {
  return [...taskDefinitions.values()];
}
