# Legal Notice

Last updated: 2026-04-19

This document explains the intended legal boundaries for this repository. It is provided for project documentation only and is not legal advice. Review the applicable publisher policies and consult qualified counsel before operating a public service, distributing exports, or using third-party game content at scale.

## License Scope

The repository's original code, scripts, configuration, and documentation are licensed under the [MIT License](./LICENSE).

The MIT License does not grant any rights to third-party game content, including card names, card text, rules text, artwork, images, logos, icons, symbols, trademarks, product names, official source files, or other materials owned by game publishers or other rights holders.

Third-party dependencies remain governed by their own licenses.

## Third-Party Games and Content

TCG Cards is an independent, unofficial project for indexing, searching, presenting, and exporting trading card game data.

This project is not affiliated with, sponsored by, endorsed by, or officially authorized by any game publisher, platform owner, or rights holder unless explicitly stated in writing.

All third-party game names, card content, artwork, logos, trademarks, and source data belong to their respective owners. References to those games are used for identification, compatibility, indexing, research, and informational purposes.

## Game-Specific Notices

### Magic: The Gathering

Magic: The Gathering and related names, card text, artwork, symbols, logos, and other materials are property of Wizards of the Coast and/or their respective rights holders.

When using Magic: The Gathering content, review and follow the current Wizards of the Coast Fan Content Policy:

- https://company.wizards.com/en/legal/fancontentpolicy

Any deployed site, API, export, or asset workflow that includes Wizards of the Coast content should preserve required notices, avoid implying official approval, and avoid using restricted logos or trademarks except where a policy or separate permission allows it.

### Hearthstone

Hearthstone and related names, card text, artwork, logos, and other materials are property of Blizzard Entertainment and/or their respective rights holders.

When using Hearthstone or Blizzard content, review and follow the current Blizzard legal materials, including the Blizzard Legal FAQ and website terms:

- https://www.blizzard.com/legal/c1ae32ac-7ff9-4ac3-a03b-fc04b8697010/blizzard-legal-faq
- https://www.blizzard.com/en-us/legal/511dbf9e-2b2d-4047-8243-4c5c65e0ebf1/terms-of-use-for-blizzard-s-websites

Any deployed site, API, export, or asset workflow that includes Blizzard content should preserve required notices, avoid implying official approval, and avoid uses that conflict with Blizzard's published policies.

### Other Games

Before adding support for another TCG, review that game's publisher policies, API terms, dataset licenses, asset rules, and trademark rules. Add a game-specific notice here when third-party content is indexed, displayed, redistributed, or exported.

## Data and Asset Policy

Do not commit large raw source files, proprietary datasets, card images, downloaded archives, or generated full exports to Git unless their redistribution is clearly permitted and the decision is documented.

For each external source, keep enough metadata to identify:

- the source name and URL
- the source version or retrieval date
- the applicable license, policy, or terms
- whether the data may be stored, transformed, displayed, exported, or redistributed
- any attribution, notice, or takedown requirements

The `references/` directory is for local modeling references and curated source material. Large raw source files should remain outside Git when covered by `.gitignore`.

## API and Database Exports

APIs and full database exports may include or derive from third-party game content. The MIT License for this repository does not sublicense that third-party content.

Consumers of APIs, exports, and generated assets are responsible for complying with the original publisher policies, dataset licenses, and applicable law.

When practical, exports should include source metadata, version metadata, and notices that distinguish original project data from third-party game content.

## Trademarks

All trademarks, service marks, logos, product names, and game names are the property of their respective owners.

Use of third-party names in this project is intended to identify the games and datasets being indexed. It does not imply affiliation, endorsement, sponsorship, or authorization.

## Takedown and Correction Requests

If you are a rights holder or authorized representative and believe that this repository, a deployed service, an API response, or an exported dataset contains material that should be removed or corrected, please open a GitHub issue with `Legal` or `Takedown` in the title.

Please include:

- the content or URL at issue
- the rights holder you represent
- the requested action
- enough information to verify and process the request

Requests will be reviewed in good faith. Content may be removed, corrected, disabled, or excluded from future exports while a request is evaluated.

## Privacy and Service Terms

This document does not describe user privacy practices or service terms in detail.

See [PRIVACY.md](./PRIVACY.md) and [TERMS.md](./TERMS.md) for baseline privacy and service terms. These documents should be reviewed and completed with operator-specific details before public launch.
