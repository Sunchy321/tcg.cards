# Hearthstone Image Renderer Protocol

**Protocol version: 1**

## Purpose

This document defines the external HTTP contract for a Hearthstone card image renderer.

This document specifies request and response requirements for the renderer endpoint. It does not define caller-side batching, job orchestration, polling, or local import workflows.

## Applicable Scope

This specification applies to one synchronous render request:

- one HTTP request renders one image
- the request body is JSON
- the success response body is PNG

Batch splitting and higher-level task orchestration are outside the scope of this specification.

## Endpoints

The renderer must expose the following endpoints:

- `POST /render`
- `GET /status`

### `POST /render`

The renderer must accept:

- method: `POST`
- request `Content-Type`: `application/json`
- response `Content-Type`: `image/png` on success

The renderer must return one PNG image directly in the response body for a successful request.

### `GET /status`

The renderer must expose a status endpoint for service availability and protocol compatibility checks.

The endpoint must accept:

- method: `GET`

The endpoint must return:

- HTTP status: `200` when the service is reachable and can report status
- `Content-Type: application/json`

The response body must include the following fields:

- `service`
  Stable renderer service identifier.
- `version`
  Renderer implementation version.
- `protocolVersion`
  Implemented version of this external renderer protocol.
- `requestShape`
  Supported request-shape identifier.
- `outputFormat`
  Success response image format. The expected value is `png`.
- `ready`
  Whether the renderer is currently able to accept render requests.
- `message`
  Optional human-readable status message.

The caller checks service availability and compatibility by evaluating:

- whether `GET /status` is reachable
- whether `ready` is `true`
- whether `protocolVersion`, `requestShape`, and `outputFormat` match the caller's expected values

## Request Model

The request body must be a single-image render request object.

The renderer must be able to read the following minimum inputs from the request body:

- one card identifier
- `variant`
- output width and height
- `renderModel`

Under the current contract, the card identifier may be provided in either of these locations:

- `card.cardId`
- `renderModel.cardId`

The fields directly required by the renderer are:

- `variant`
  Requested zone, template, and premium combination.
- `output`
  Declared output image requirements. This specification currently requires `output.width` and `output.height` only.
- `renderModel`
  Canonical render-model payload used to produce the card image.

`requestId` may be supplied as a caller-side tracing field, but it is not a precondition for a successful render.

`card`, `style`, `target`, `output.fileName`, and other export-side fields may appear in the request body, but they are not part of the minimum input set that the renderer is required to depend on.

The endpoint defined by this specification accepts one render request object and does not accept a batch wrapper document.

## Post Body Structure

The `POST /render` request body is a single JSON object conforming to the `ImageRequirementRequest` schema defined in the shared upstream model.

### Required vs Optional Fields

The renderer depends on a subset of the request body:

- **Required for rendering**: `variant`, `output.width`, `output.height`, `renderModel`, and one card identifier (`card.cardId` or `renderModel.cardId`).
- **Optional / not consumed by the renderer**: `requestId`, `card` (except `cardId`), `style`, `target`, `output.fileName`, `output.format`, `output.transparentBackground`.

Fields not consumed by the renderer are carried in the request for caller-side tracing and export/import workflows.

### Example

```json
{
  "requestId": "req_abc123",
  "card": {
    "cardId": "ABC_123",
    "lang": "zhs",
    "version": [35, 4, 0],
    "revisionHash": "abc123def456",
    "localizationHash": "loc_hash_001",
    "renderHash": "render_hash_001"
  },
  "variant": {
    "zone": "play",
    "template": "normal",
    "premium": "normal"
  },
  "style": {
    "styleKey": "play_normal_normal_default",
    "zone": "play",
    "template": "normal",
    "premium": "normal",
    "layout": "default",
    "width": 512,
    "height": 768,
    "transparentBackground": false
  },
  "output": {
    "fileName": "ABC_123_play_normal_normal.png",
    "format": "png",
    "width": 512,
    "height": 768,
    "transparentBackground": false
  },
  "target": {
    "r2Bucket": "hearthstone-card-images",
    "r2Key": "v1/play/normal/normal/ab/abc123def456.webp",
    "contentType": "image/webp"
  },
  "renderModel": {
    "cardId": "ABC_123",
    "lang": "zhs",
    "variant": "normal",
    "templateVersion": "35.4.0",
    "assetVersion": "35.4.0",
    "localization": {
      "name": "Ragnaros the Firelord",
      "richText": "<b>Battlecry:</b> Deal 8 damage."
    },
    "type": "minion",
    "cost": 8,
    "attack": 8,
    "health": 8,
    "durability": null,
    "armor": null,
    "classes": ["neutral"],
    "race": ["elemental"],
    "spellSchool": null,
    "mercenaryFaction": null,
    "set": 3,
    "overrideWatermark": null,
    "rarity": "legendary",
    "elite": false,
    "techLevel": null,
    "rune": null,
    "renderMechanics": {}
  }
}
```

### Field Reference

#### `requestId`

- **Type**: `string`
- **Required**: No

Caller-side tracing identifier. Not consumed by the renderer.

#### `card`

- **Type**: `object`
- **Required**: No, but `card.cardId` is one of two accepted card identifier locations.

| Field | Type | Description |
|-------|------|-------------|
| `cardId` | `string` | Card identifier |
| `lang` | `string` | Locale code (e.g. `zhs`, `enus`) |
| `version` | `number[]` | Game version as `[major, minor, patch]` |
| `revisionHash` | `string` | Content revision hash |
| `localizationHash` | `string` | Localization content hash |
| `renderHash` | `string` | Render identity hash |

#### `variant`

- **Type**: `object`
- **Required**: Yes

| Field | Type | Values | Description |
|-------|------|--------|-------------|
| `zone` | `string` | `"hand"`, `"play"` | Card display zone |
| `template` | `string` | `"normal"`, `"battlegrounds"` | Card template |
| `premium` | `string` | `"normal"`, `"golden"`, `"diamond"`, `"signature"` | Premium treatment |

#### `style`

- **Type**: `object`
- **Required**: No

Rendering style declaration used by the export/import pipeline. Not consumed by the renderer.

| Field | Type | Description |
|-------|------|-------------|
| `styleKey` | `string` | Style identifier |
| `zone` | `string` | Same as `variant.zone` |
| `template` | `string` | Same as `variant.template` |
| `premium` | `string` | Same as `variant.premium` |
| `layout` | `string` | Layout identifier |
| `width` | `number` | Styled width in pixels |
| `height` | `number` | Styled height in pixels |
| `transparentBackground` | `boolean` | Whether transparent background is requested |

#### `output`

- **Type**: `object`
- **Required**: Yes (at minimum `width` and `height`)

| Field | Type | Description |
|-------|------|-------------|
| `fileName` | `string` | Output PNG filename. Not consumed by the renderer. |
| `format` | `"png"` | Output format. Always `"png"`. |
| `width` | `number` (positive integer) | Output image width in pixels |
| `height` | `number` (positive integer) | Output image height in pixels |
| `transparentBackground` | `boolean` | Whether the output should have a transparent background. Not consumed by the renderer. |

#### `target`

- **Type**: `object`
- **Required**: No

Storage target metadata used by the import pipeline. Not consumed by the renderer.

| Field | Type | Description |
|-------|------|-------------|
| `r2Bucket` | `string` | Target R2 bucket name |
| `r2Key` | `string` | Target R2 object key |
| `contentType` | `"image/webp"` | Target content type. Always `"image/webp"`. |

#### `renderModel`

- **Type**: `object`
- **Required**: Yes

Canonical render-model payload containing all card data needed to produce the card image. This is the primary input the renderer consumes to drive rendering.

| Field | Type | Description |
|-------|------|-------------|
| `cardId` | `string` | Card identifier |
| `lang` | `string` | Locale code |
| `variant` | `string` | Card variant identifier |
| `templateVersion` | `string` | Template version |
| `assetVersion` | `string` | Asset version |
| `localization` | `object` | Localized text payload |
| `localization.name` | `string` | Card name |
| `localization.richText` | `string` | Card text with markup |
| `type` | `string` | Card type (e.g. `minion`, `spell`, `weapon`) |
| `cost` | `number` | Mana cost |
| `attack` | `number \| null` | Attack value |
| `health` | `number \| null` | Health value |
| `durability` | `number \| null` | Durability (weapons) |
| `armor` | `number \| null` | Armor value |
| `classes` | `string[]` | Class affiliations |
| `race` | `string[] \| null` | Minion races |
| `spellSchool` | `string \| null` | Spell school |
| `mercenaryFaction` | `string \| null` | Mercenary faction |
| `set` | `number` | Card set identifier |
| `overrideWatermark` | `string \| null` | Override watermark |
| `rarity` | `string \| null` | Rarity (e.g. `legendary`, `epic`) |
| `elite` | `boolean` | Elite flag |
| `techLevel` | `number \| null` | Battlegrounds tech level |
| `rune` | `string[] \| null` | Death knight rune combination (`blood`, `frost`, `unholy`) |
| `renderMechanics` | `object` | Render mechanic flags. See the `renderMechanics` subsection below for the full key list. |

#### `renderMechanics`

A partial-record object keyed by GAME_TAG enum IDs (as numeric strings). Only mechanics that apply to the card are present. Each key is optional.

Value type: `boolean | integer`

Hearthstone GAME_TAG enum IDs are used as keys to avoid slug-name instability across data updates.

| Key (string) | GAME_TAG | Slug | Description |
|-------------|----------|------|-------------|
| `"682"` | HIDE_HEALTH | `hide-health` | Suppress health value display on the rendered card |
| `"683"` | HIDE_ATTACK | `hide-attack` | Suppress attack value display on the rendered card |
| `"684"` | HIDE_COST | `hide-cost` | Suppress mana cost display on the rendered card |
| `"1107"` | HIDE_WATERMARK | `hide-watermark` | Suppress class watermark on the rendered card |
| `"1720"` | TRADEABLE | `tradeable` | Card has the tradeable mechanic |
| `"1824"` | IN_MINI_SET | `in-mini-set` | Card belongs to the current mini-set |
| `"2785"` | FORGE | `forge` | Card has the forge mechanic |
| `"4503"` | TIMEWARPED | `timewarped` | Card has the Battlegrounds timewarped mechanic |

## Functional Requirements

The renderer must satisfy the following behavior constraints:

- return a valid PNG binary for one valid request
- render exactly one image per request
- treat the request body as self-contained render input
- respect `output.width` and `output.height`
- support the declared `variant` and `renderModel` needed for Hearthstone card rendering
- provide `GET /status` for availability and compatibility inspection

For equivalent request payloads, the renderer should produce equivalent visual output unless the renderer version or asset set has changed.

## Success Response

On success, the renderer should return:

- HTTP status: `200`
- `Content-Type: image/png`
- body: PNG bytes

The success response body contains PNG bytes only.

## Failure Response

On failure, the renderer should return one non-2xx response.

The error body may be plain text or JSON, but it should contain one human-readable message that the caller can surface for diagnostics.

Recommended behavior:

- `400` for invalid input payloads
- `422` for well-formed requests that cannot be rendered
- `500` for renderer-side unexpected failures

These status codes are recommendations rather than a required enumeration. The renderer must not return `200` when no valid PNG is produced.

## Out of Scope

This specification does not define:

- multi-image batch submission
- asynchronous jobs
- job status polling
- progress events
- zip archive upload or download
- remote storage upload
- persistent task history
- authentication or authorization
- caller-side compatibility policy beyond the `/status` response fields
- background transparency semantics
- full field requirements of the export-side requirements document

If those capabilities are required, they must be defined by a separate protocol or by caller-side implementation.

## Implementation References

- Shared upstream model: [`packages/model/src/hearthstone/schema/data/image.ts`](../packages/model/src/hearthstone/schema/data/image.ts)
