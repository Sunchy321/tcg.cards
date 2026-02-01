# AI Agent Instructions for TCG.cards Project

## Project Overview
This is a comprehensive Trading Card Game (TCG) management platform supporting multiple games including Magic: The Gathering, Hearthstone, Yu-Gi-Oh!, Lorcana, and Pokemon TCG. The project uses a monorepo structure with packages for server, client, models, and utilities.

## Technology Stack
- **Backend**: Node.js with TypeScript, ORPC for API routing, Drizzle ORM for database
- **Frontend**: Vue 3 with Quasar framework
- **Database**: PostgreSQL (via Drizzle ORM)
- **Build Tools**: bun workspaces, Vite
- **Code Quality**: ESLint with strict TypeScript rules, Stylistic plugin for formatting

## Code Style Guidelines

### TypeScript
- Use **strict TypeScript mode** - all types must be properly defined
- Prefer `type` over `interface` unless extending is needed
- Use `z.object()` from Zod for runtime validation and type inference
- Never use `any` except when absolutely necessary (discouraged by ESLint)
- Use `unknown` for truly unknown types, then narrow with type guards
- Prefix unused parameters with underscore: `_param`, `_error`, `_context`

### Naming Conventions
- **camelCase**: variables, functions, properties
- **PascalCase**: classes, types, interfaces, Drizzle schema tables
- **UPPER_SNAKE_CASE**: constants and environment variables
- **kebab-case**: file names, folder names, CSS classes
- Game-specific prefixes: Use game ID in paths (e.g., `magic/`, `hearthstone/`, `yugioh/`)

### Formatting (Stylistic Rules)
- **Indentation**: 4 spaces (not 2)
- **Quotes**: Single quotes for strings, avoid template literals unless necessary
- **Semicolons**: Required at end of statements
- **Brace style**: 1TBS (one true brace style), single-line blocks allowed
- **Arrow functions**: Omit parens for single parameter (`x => x * 2`)
- **Key-value alignment**: Align values in object literals for readability
- **Comment**: Always use English
- **Boolean check**: Never use `!a` check a is zero or null. Use `a === 0` or `a == null` instead

```typescript
// Example of proper formatting
const example = {
    name:        'Example',
    description: 'This shows proper alignment',
    format:      'standard',
    cards:       [],
};
```

### File Organization
- Group imports by: external packages → internal packages (`@/`) → relative imports
- Use path aliases: `@/` for server src, `@model/` for models, `@common/` for common utilities
- Keep related functionality in the same directory (router, schema, service pattern)
- One main export per file for utilities, multiple exports for schemas/types

### API Design with ORPC
- Define routes using `os.route()` pattern with method, description, and tags
- Always include input validation with Zod schemas
- Always define output types with Zod
- Use proper HTTP methods: GET (query), POST (create), PUT (update), DELETE (remove)
- Include comprehensive error handling with `ORPCError` and proper status codes
- Check user authentication in context before operations requiring login
- Validate foreign key references (cards, formats, etc.) exist before creating/updating

```typescript
const route = os
    .route({
        method:      'POST',
        description: 'Clear description of what this does',
        tags:        ['Game', 'Resource'],
    })
    .input(z.object({ /* inputs */ }))
    .output(z.object({ /* outputs */ }))
    .handler(async ({ input, context }) => {
        // Implementation
    });
```

### Database Operations with Drizzle
- Use Drizzle schema definitions in `schema/` directories
- Always use parameterized queries (Drizzle handles this automatically)
- Use `.returning()` for getting inserted/updated values
- Prefer `.then(rows => rows[0])` for single row queries
- Use proper SQL helpers: `eq()`, `inArray()`, `and()`, `or()`, `desc()`, etc.
- Transaction support: wrap multiple operations in `db.transaction()`

### Error Handling
- Use `ORPCError` for API errors with semantic codes:
  - `'UNAUTHORIZED'`: User not logged in
  - `'FORBIDDEN'`: User lacks permission
  - `'NOT_FOUND'`: Resource doesn't exist
  - `'BAD_REQUEST'`: Invalid input data
- Always provide descriptive error messages
- Validate required data exists before operations
- Check ownership before allowing updates/deletes

### Vue Components
- Use `<script setup lang="ts">` syntax
- Define props and emits with TypeScript types
- Use composition API with `ref`, `computed`, `watch`
- Keep template logic minimal, move complex logic to computed or methods
- Use Quasar components following their naming conventions
- 4-space indentation for template HTML

### Comments and Documentation
- Add JSDoc comments for public functions and exported types
- Use inline comments to explain complex business logic
- Document why, not what (code should be self-explanatory)
- Include TODO comments for technical debt: `// TODO: description`

## Game-Specific Guidelines

### Multi-Game Support
- Each game has its own package structure: `magic/`, `hearthstone/`, `yugioh/`, etc.
- Common functionality goes in `@common/` package
- Game-specific models in `@model/[game]/`
- Respect game-specific terminology and data structures

### Card Data Management
- Card IDs are game-specific strings
- Support multiple locales per game (see `locale` enums in schema)
- Print data separate from card data
- Handle versioning for updated card text/rules

## Security Requirements
- Always validate user authentication for protected operations
- Check resource ownership before updates/deletes
- Sanitize user inputs through Zod validation
- Use prepared statements (Drizzle default) for SQL queries
- Respect deck visibility settings (private/unlisted/public)

## Performance Considerations
- Use pagination for list endpoints (limit/offset pattern)
- Index frequently queried fields in database schema
- Lazy load large datasets in frontend
- Cache static game data (formats, card lists)
- Optimize card image loading with proper asset paths

## Testing Expectations
- Write unit tests for complex business logic
- Test API routes with various input scenarios
- Include error case testing
- Mock database calls in unit tests

## Common Patterns to Follow

### Deck Management
- Validate card legality in format
- Enforce deck size limits per format
- Track deck metadata: creator, created/updated dates, likes, favorites
- Support deck tags and visibility levels

### Search and Filtering
- Use Drizzle query builders for complex filters
- Support text search with SQL `LIKE` or full-text search
- Allow filtering by multiple criteria (format, tags, user, etc.)

### User Actions
- Like/favorite tracking with separate tables
- User ownership validation
- Activity timestamps (createdAt, updatedAt)

## File Naming Examples
- Routes: `deck.ts`, `card.ts`, `format.ts`
- Schemas: `deck.ts` (in schema/ folder), `card.ts`
- Components: `DeckEditor.vue`, `CardList.vue`
- Utils: `text-prettifier.ts`, `image-loader.ts`

## ESLint Compliance
- Fix all errors before committing
- Warnings should be addressed unless documented why they're acceptable
- Use `// eslint-disable-next-line` sparingly with justification
- Run linter before pushing code
- Don't fix code while agent working

## Additional Notes
- Prefer functional programming patterns over classes
- Use async/await over raw Promises
- Destructure objects for cleaner parameter passing
- Keep functions focused and single-purpose
- Maximum 2 statements per line (ESLint enforced)
