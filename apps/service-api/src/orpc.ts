import { implement } from '@orpc/server';

import { registryContract } from '@tcg-cards/api';

/** Implementer derived from the shared contract; handlers attach via `os.<path>.handler(...)`. */
export const os = implement(registryContract);
