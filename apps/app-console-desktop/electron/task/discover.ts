// Only registration modules are eagerly evaluated. Their Worker definitions stay lazy.
import.meta.glob('../**/*.task.ts', { eager: true });
