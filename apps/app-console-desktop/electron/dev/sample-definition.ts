import { controlledDefinition } from './controlled';

// Durable boundaries let the run survive an app restart as interrupted.
export default controlledDefinition(400, 'durable');
