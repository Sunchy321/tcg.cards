# Each site executes its own backend; share code modules, not HTTP routes

Every first-party `site-*` executes its own backend inside its own Worker: same-origin auth entry, browser RPC entry, SSR first-paint aggregation, and page-level redirect, cache, and error mapping. A site is never routed through an external service. `service-internal` exists only for the standalone apps and is never a downstream execution surface for a `site-*`; when a site needs the same capability, it composes the same shared workspace package locally. Shared capability is therefore a code module under `packages/*`, not a shared HTTP route and not a proxy hop.

**Why:** The earlier model kept the entry at the site but moved execution to `service-internal`, with the site's `/auth/*` and `/rpc/*` forwarding to it. That was rejected because it adds a network hop and a proxy failure surface to first paint and login, and because it turns the internal service into an implicit runtime dependency of the public sites.
