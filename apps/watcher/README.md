# Watcher

A Cloudflare Worker that monitors data sources and sends email notifications when changes are detected.

## Features

- **Scheduled Monitoring**: Automatically checks data sources daily
- **Manual Triggering**: HTTP endpoints for on-demand checks
- **Email Notifications**: Alerts sent via SendGrid when changes or failures occur
- **State Persistence**: Uses Cloudflare KV to track last known values
- **Rate-Limited Alerts**: Failure notifications limited to once per 24 hours
- **Extensible**: Easy to add new data source checkers

## Architecture

```
src/
├── index.ts              # Worker entry point, routing
├── config.ts             # Source configurations
├── types.ts              # TypeScript interfaces
├── notifications/
│   └── email.ts          # SendGrid email integration
├── sources/
│   └── magic/
│       └── rule.ts       # MTG rules checker
└── utils/
    └── state.ts          # KV state management
```

## Configuration

### 1. Environment Variables

Create `.dev.vars` for local development:

```bash
cp .dev.vars.example .dev.vars
```

Edit `.dev.vars`:

```
EMAIL_TO=your-email@example.com
SENDGRID_API_KEY=SG.xxx
```

### 2. KV Namespace

The KV namespace is already configured in `wrangler.toml`. For local development, Wrangler provides a mock KV automatically.

For production, ensure the KV namespace exists:

```bash
wrangler kv:namespace list
```

## Development

### Install Dependencies

```bash
bun install
```

### Run Locally

```bash
bun run dev
```

The worker will be available at `http://localhost:8787`.

### Test Endpoints

```bash
# Health check
curl http://localhost:8787/health

# Trigger all checkers
curl -X POST http://localhost:8787/trigger

# Trigger specific checker
curl http://localhost:8787/trigger/magic/rule
```

## Deployment

### 1. Set Secrets

```bash
wrangler secret put EMAIL_TO
# Enter your email address

wrangler secret put RESEND_API_KEY
# Enter your Resend API key (get one at https://resend.com)
```

### 2. Deploy

```bash
bun run deploy
```

## Adding a New Data Source

1. **Add configuration** in `src/config.ts`:

```typescript
'source/id': {
  id: 'source/id',
  name: 'Source Name',
  type: 'url', // or 'github-tags', 'api'
  url: 'https://api.example.com/data',
  checkInterval: 24 * 60 * 60, // seconds
},
```

2. **Create checker** in `src/sources/`:

```typescript
// src/sources/example/source.ts
import type { CheckResult, Env, SourceChecker } from '../../types';
import { loadState, saveState } from '../../utils/state';
import { sendUpdateNotification } from '../../notifications/email';
import { SOURCES } from '../../config';

export class ExampleSourceChecker implements SourceChecker {
  private config = SOURCES['source/id'];

  async check(env: Env): Promise<CheckResult> {
    const state = await loadState(env, this.config.id) ?? {};

    // Fetch current value
    const response = await fetch(this.config.url);
    const currentValue = await response.text();

    const changed = state.lastValue !== undefined && state.lastValue !== currentValue;

    if (changed) {
      await sendUpdateNotification(
        env,
        this.config.name,
        state.lastValue,
        currentValue,
        this.config.url
      );
    }

    await saveState(env, this.config.id, {
      lastValue: currentValue,
      lastCheck: new Date().toISOString(),
      lastSuccess: true,
    });

    return {
      changed,
      currentValue,
      previousValue: state.lastValue,
      message: changed ? 'Updated' : 'No changes',
    };
  }
}
```

3. **Register checker** in `src/index.ts`:

```typescript
import { ExampleSourceChecker } from './sources/example/source';

const checkers = {
  'magic/rule': new MagicRuleChecker(),
  'source/id': new ExampleSourceChecker(), // Add here
};
```

## Available Checkers

### magic/rule

Monitors Magic: The Gathering Comprehensive Rules for updates.

- **Schedule**: Daily at 00:00 UTC
- **Endpoint**: `/trigger/magic/rule`
- **URL**: https://rules.wizards.com/rulebook/gcr

## Troubleshooting

### Emails not sending

Check logs for:
- Missing `EMAIL_TO` or `RESEND_API_KEY`
- Resend API errors (invalid key, unverified domain)

**Note**: Resend requires domain verification for production use. In development, you can only send to the email address used to sign up.

### State not persisting

Verify KV binding:
```bash
wrangler kv:key list --binding WATCHER_KV
```

### Checker not found

Ensure the checker ID in the URL matches the key in the `checkers` object.

## License

MIT
