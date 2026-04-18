# Privacy Policy

Last updated: 2026-04-19

This Privacy Policy describes how TCG Cards handles information in connection with this repository, deployed websites, app-facing endpoints, public APIs, database exports, and related tools.

This document is a project template and operational policy, not legal advice. Before a public launch, confirm the project operator name, contact address, hosting locations, analytics tools, and jurisdiction-specific obligations.

## Scope

This policy applies to services operated under the TCG Cards project, including:

- public websites for supported TCGs
- account, deck, favorite, and settings features
- public and app-facing APIs
- database export endpoints
- internal console features when used by authorized operators
- watcher and notification services operated by the project

This policy does not apply to third-party websites, APIs, datasets, or services that TCG Cards links to or integrates with. Those third parties are governed by their own policies.

## Information We Collect

Depending on which features are enabled, the service may collect the following information.

### Account Information

- email address
- username or display name
- password authentication metadata handled through the authentication system
- session identifiers and login state
- API keys created for account or developer access
- account roles, permissions, and administrative status

### User Content and Preferences

- deck lists and related deck metadata
- likes, favorites, saved cards, or other saved user actions
- search settings, language preferences, and UI preferences
- messages submitted to assistant or chat features
- feedback, issue reports, takedown requests, or support messages

### Technical and Usage Information

- IP address
- request URL, method, status code, and timestamp
- browser, device, and operating system information
- referrer and user-agent strings
- API usage, rate-limit events, and error logs
- security, abuse-prevention, and operational logs

### Data Source and Import Metadata

The service may store source metadata such as external dataset names, versions, hashes, retrieval times, upstream URLs, and import status. This information usually does not identify individual users.

## How We Use Information

We use collected information to:

- provide, operate, and secure the service
- authenticate users and manage sessions
- support account, deck, favorite, API key, and settings features
- answer API requests and provide database exports
- monitor service health, diagnose bugs, and prevent abuse
- send operational notifications where configured
- respond to support, legal, correction, or takedown requests
- improve search, data import, and card presentation features
- comply with legal obligations and enforce service terms

## Cookies and Local Storage

The service may use cookies, local storage, or similar technologies for:

- authentication sessions
- language and display preferences
- security and abuse prevention
- remembering local UI state

If analytics, advertising, or tracking tools are added later, this policy should be updated before those tools are enabled.

## AI and Assistant Features

If assistant or chat features are enabled, user messages may be sent to a configured AI provider or compatible API endpoint to generate responses. The service may also send relevant card, rules, or search context to that provider.

Do not submit sensitive personal information, confidential data, payment information, secrets, private keys, or information you do not want processed by an external provider.

AI providers process submitted data under their own terms and privacy policies. The project operator should document the active provider before public launch.

## How We Share Information

We do not sell personal information.

We may share information with:

- hosting and infrastructure providers, including Cloudflare services such as Workers, R2, KV, Hyperdrive, and related logs
- database, storage, and backup providers
- authentication, email, notification, and security tooling
- AI providers when assistant features are used
- source control and issue tracking platforms when users submit issues or legal requests
- legal, compliance, security, or abuse-prevention recipients when required or reasonably necessary

We may also disclose information if required by law, court order, legal process, or to protect the rights, safety, and security of users, the project, or third parties.

## Public Content

Some user actions may be public or visible to other users if the relevant feature is enabled, such as public deck lists, usernames, comments, or shared content. Do not publish information you do not want to make public.

## Data Retention

We keep personal information only as long as reasonably necessary for the purposes described in this policy, including operation, security, legal compliance, backups, and dispute resolution.

Typical retention rules should be configured before public launch:

- account data is retained while the account remains active
- sessions and API keys are retained until expiration, revocation, or account deletion
- logs are retained for a limited operational and security period
- backups may retain deleted data for a limited backup lifecycle
- legal, abuse, or takedown records may be retained as needed to handle the request

## Security

We use reasonable technical and organizational measures to protect information, including access controls, environment secrets, database access controls, and infrastructure security features.

No online service can guarantee perfect security. Users are responsible for keeping their account credentials and API keys secure.

## Your Choices and Rights

Depending on your location and applicable law, you may have rights to:

- access personal information associated with your account
- correct inaccurate information
- delete your account or certain personal information
- object to or restrict certain processing
- request a copy of certain information
- opt out of certain sharing or marketing uses if such uses are introduced

To make a request, open a GitHub issue with `Privacy` in the title or use the contact method published by the project operator.

We may need to verify your identity before fulfilling a request. Some information may be retained where required for security, legal compliance, backups, abuse prevention, or legitimate operational needs.

## Children

The service is not intended for children under 13. Do not use the service or create an account if you are under 13. If the project operator learns that personal information from a child under 13 has been collected, the operator should delete it where required.

Additional age requirements may apply in some jurisdictions.

## International Processing

The service may be operated using infrastructure in multiple regions. By using the service, information may be processed and stored outside your country or region, subject to applicable law and provider configurations.

## Third-Party Links and Content

The service may link to third-party websites, APIs, datasets, card databases, game publishers, image hosts, or community resources. We are not responsible for the privacy practices of those third parties.

Third-party game content, trademarks, card images, card text, and source data are addressed separately in [LEGAL.md](./LEGAL.md).

## Changes to This Policy

This policy may be updated as the project evolves. Material changes should be documented in the repository and, for public services, communicated in a reasonable way before or when they take effect.

## Contact

For privacy questions or requests, open a GitHub issue with `Privacy` in the title unless the project operator publishes a dedicated contact address.
