import { randomUUID } from 'node:crypto';

/** Unique identifier for this application boot session, generated once per module load. */
export const runtimeBootId = randomUUID();

/** Generates a unique key for session-bound resume validation. */
export function generateResumeContextKey(): string {
  return randomUUID();
}
