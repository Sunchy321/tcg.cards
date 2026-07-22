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

Every request uses the complete `ImageRequirementRequest` task shape. All fields in that shape are required by the end-to-end render and import workflow, although only the following fields directly affect PNG generation:

- `variant`
- output width and height
- `renderModel`

For `partial-update`, the renderer additionally consumes `card` to locate the base state in its internal game data. `card.cardId` and `renderModel.cardId` must identify the same card.

The fields directly required by the renderer are:

- `variant`
  Requested zone, template, and premium combination.
- `output`
  Declared output image requirements. This specification currently requires `output.width` and `output.height` only.
- `renderModel`
  Canonical render-model payload used to produce the card image.

`requestId`, `style`, `target`, `output.fileName`, `output.format`, and `output.transparentBackground` are required task metadata. They support result correlation, validation, import, and storage, but the renderer does not consume them to generate pixels.

The endpoint defined by this specification accepts one render request object and does not accept a batch wrapper document.

## Post Body Structure

The `POST /render` request body is a single JSON object conforming to the `ImageRequirementRequest` schema defined in the shared upstream model.

### Field Roles

The complete task object is required, while the renderer consumes only a subset for PNG generation:

- **Consumed for every render**: `variant`, `renderMode`, `output.width`, `output.height`, and `renderModel`.
- **Additionally consumed for `partial-update`**: `card.cardId` and `card.lang`, used to load the base state from the renderer's internal game data.
- **Required task metadata, not consumed for pixel generation**: `requestId`, `style`, `target`, `output.fileName`, `output.format`, and `output.transparentBackground`.

Fields not consumed for pixel generation remain mandatory because the same object continues through result correlation and the export/import workflow.

### Example

```json
{
  "requestId": "sha256:9ca666539f9e4b7746527ed13cf4d5cda4a79c9126fcd8781ac1c89a38e7841c",
  "card": {
    "cardId": "ABC_123",
    "lang": "en"
  },
  "variant": {
    "category": "glow",
    "zone": "hand",
    "template": "normal",
    "premium": "normal"
  },
  "renderMode": "full-set",
  "style": {
    "styleKey": "hand_normal_normal_default",
    "category": "glow",
    "zone": "hand",
    "template": "normal",
    "premium": "normal",
    "layout": "default",
    "width": 512,
    "height": 768,
    "transparentBackground": false
  },
  "output": {
    "fileName": "9ca666539f9e4b7746527ed13cf4d5cda4a79c9126fcd8781ac1c89a38e7841c.png",
    "format": "png",
    "width": 512,
    "height": 768,
    "transparentBackground": false
  },
  "target": {
    "r2Bucket": "hearthstone-card-images",
    "r2Key": "hearthstone/card/glow/hand/normal/normal/re/render_hash_001.webp",
    "contentType": "image/webp"
  },
  "renderModel": {
    "cardId": "ABC_123",
    "lang": "enus",
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
    "classes": ["neutral"],
    "race": ["elemental"],
    "set": 3,
    "rarity": "legendary",
    "elite": false,
    "glow": [
      { "part": "attack", "type": "buff" },
      { "part": "text", "type": "nerf" }
    ],
    "renderMechanics": {}
  }
}
```

### Field Reference

#### `requestId`

- **Type**: `string`
- **Required**: Yes

Caller-side tracing identifier. Not consumed by the renderer.

#### `card`

- **Type**: `object`
- **Required**: Yes. The renderer uses this object to locate internal game data for `partial-update`.

| Field | Type | Description |
|-------|------|-------------|
| `cardId` | `string` | Card identifier |
| `lang` | `string` | Locale code (e.g. `zhs`, `enus`) |

#### `variant`

- **Type**: `object`
- **Required**: Yes

| Field | Type | Values | Description |
|-------|------|--------|-------------|
| `category` | `string` | `"base"`, `"glow"` | Image category |
| `zone` | `string` | `"hand"`, `"play"` | Card display zone |
| `template` | `string` | `"normal"`, `"battlegrounds"` | Card template |
| `premium` | `string` | `"normal"`, `"golden"`, `"diamond"`, `"signature"` | Premium treatment |

#### `renderMode`

- **Type**: `string`
- **Required**: Yes
- **Input default**: `"full-set"`; canonical serialized tasks include the resolved value.
- **Values**: `"full-set"`, `"partial-update"`

Declares the field-presence semantics for `renderModel` optional fields.

| Value | Base state | Absent optional field |
|-------|------------|-----------------------|
| `"full-set"` | None | The field is not applicable or is cleared. |
| `"partial-update"` | Loaded from internal game data using `card` | Preserve the value from the base state. |

When `"partial-update"`, the renderer first resolves the base render model from its internal game data using `card`, then overlays fields present in `renderModel`. Optional fields that are absent preserve their base-state values.

When `"full-set"`, `renderModel` is a complete canonical snapshot. Optional fields may still be absent when they do not apply to the card.

#### `style`

- **Type**: `object`
- **Required**: Yes (task metadata; not consumed for pixel generation)

Rendering style declaration used by the export/import pipeline. Not consumed by the renderer.

| Field | Type | Description |
|-------|------|-------------|
| `styleKey` | `string` | Style identifier |
| `category` | `string` | Same as `variant.category` |
| `zone` | `string` | Same as `variant.zone` |
| `template` | `string` | Same as `variant.template` |
| `premium` | `string` | Same as `variant.premium` |
| `layout` | `string` | Layout identifier |
| `width` | `number` | Styled width in pixels |
| `height` | `number` | Styled height in pixels |
| `transparentBackground` | `boolean` | Whether transparent background is requested |

#### `output`

- **Type**: `object`
- **Required**: Yes. Only `width` and `height` are consumed for pixel generation.

| Field | Type | Description |
|-------|------|-------------|
| `fileName` | `string` | Output PNG filename. Not consumed by the renderer. |
| `format` | `"png"` | Output format. Always `"png"`. |
| `width` | `number` (positive integer) | Output image width in pixels |
| `height` | `number` (positive integer) | Output image height in pixels |
| `transparentBackground` | `boolean` | Whether the output should have a transparent background. Not consumed by the renderer. |

#### `target`

- **Type**: `object`
- **Required**: Yes (task metadata; not consumed for pixel generation)

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

Fields marked `?` are optional and omitted when null or not applicable. See `renderMode` for field-presence semantics.

| Field | Type | Description |
|-------|------|-------------|
| `cardId` | `string` | Card identifier |
| `lang` | `string` | Locale code |
| `templateVersion` | `string` | Template version |
| `assetVersion` | `string` | Asset version |
| `localization` | `object` | Localized text payload |
| `localization.name` | `string` | Card name |
| `localization.richText` | `string` | Card text with markup |
| `type` | `string` | Card type (e.g. `minion`, `spell`, `weapon`) |
| `cost` | `number` | Mana cost |
| `attack` | `number?` | Attack value. |
| `health` | `number?` | Health value. |
| `durability` | `number?` | Durability (weapons). |
| `armor` | `number?` | Armor value. |
| `classes` | `string[]` | Class affiliations. |
| `race` | `string[]?` | Minion races. |
| `spellSchool` | `string?` | Spell school. |
| `mercenaryRole` | `string?` | Mercenary role (`protector`, `fighter`, `caster`, `neutral`). |
| `mercenaryFaction` | `string?` | Mercenary faction (`alliance`, `horde`, `empire`, `explorer`, `legion`, `pirate`, `scourge`). |
| `colddown` | `number?` | Mercenary ability cooldown (speed value). |
| `set` | `number` | Card set identifier. |
| `overrideWatermark` | `string?` | Override watermark. |
| `rarity` | `string?` | Rarity (e.g. `legendary`, `epic`). |
| `elite` | `boolean` | Elite flag. |
| `techLevel` | `number?` | Battlegrounds tech level. |
| `rune` | `string[]?` | Death knight rune combination (`blood`, `frost`, `unholy`). |
| `glow` | `GlowEntry[]?` | Optional part-level change highlights, valid only when `variant.zone` is `"hand"`. See the `glow` subsection below. |
| `renderMechanics` | `object` | Render mechanic flags. See the `renderMechanics` subsection below for the full key list. |

#### `glow`

An optional array of part-level highlight markers. Glow rendering is supported only for hand images: a request carrying `renderModel.glow` must set `variant.zone` to `"hand"`. Requests for the `"play"` zone must not carry glow markers.

Each entry has the following shape:

| Field | Type | Description |
|-------|------|-------------|
| `part` | `GlowPart` | Card region to highlight. |
| `type` | `"buff" \| "nerf" \| "rework" \| "neutral"` | Visual treatment for a strengthened, weakened, functionally redesigned, or gameplay-neutral part. |

Supported canonical `GlowPart` values:

`cost | attack | health | text | armor | rune | rarity | art | name | race`

`durability` is accepted as an alias of `health`. The renderer must apply both values to the same visual region.

The canonical part mapping is: `cost -> ManaCost`, `attack -> Attack`, `health`/`durability -> Health`, `text -> CardText`, `armor -> Armor`, `rune -> Runes`, `rarity -> RarityGem`, `art -> Art`, `name -> CardName`, and `race -> Race`. A valid part that is not supported by the current card or prefab is silently ignored. Duplicate entries for the same visual region and treatment are merged; conflicting treatments for one visual region are rejected.

#### `renderMechanics`

A partial-record object keyed by GAME_TAG enum IDs (as numeric strings). It contains visual mechanics that apply to the card and static EntityDef inputs required by `CardTextBuilder` to derive text from `localization.richText` and `textBuilderType`. Each key is optional.

Value type: `boolean | integer`

Hearthstone GAME_TAG enum IDs are used as keys to avoid slug-name instability across data updates.

| Key (string) | GAME_TAG | Slug | Description |
|-------------|----------|------|-------------|
| `"2"` | DATA_NUM_1 | `data-num-1` | {0} replacement |
| `"3"` | DATA_NUM_2 | `data-num-2` | {1} replacement |
| `"451"` | SCORE_VALUE_1 | `score-value-1` | Countdown `@` replacement |
| `"471"` | MODULAR_ENTITY_PART_1 | `modular-entity-part-1` | First Zilliax Deluxe module dbfId |
| `"472"` | MODULAR_ENTITY_PART_2 | `modular-entity-part-2` | Second Zilliax Deluxe module dbfId |
| `"535"` | QUEST_PROGRESS_TOTAL | `quest-progress-total` | Static quest/race count input |
| `"682"` | HIDE_HEALTH | `hide-health` | Suppress health value display on the rendered card |
| `"683"` | HIDE_ATTACK | `hide-attack` | Suppress attack value display on the rendered card |
| `"684"` | HIDE_COST | `hide-cost` | Suppress mana cost display on the rendered card |
| `"813"` | HIDDEN_CHOICE | `hidden-choice` | Select hidden-choice text section |
| `"955"` | USE_ALTERNATE_CARD_TEXT | `use-alternate-card-text` | Select N-th alternate text segment (split by `@`) |
| `"1107"` | HIDE_WATERMARK | `hide-watermark` | Suppress class watermark on the rendered card |
| `"1471"` | BACON_TRIPLED_BASE_MINION_ID | `bacon-tripled-base-minion-id` | First Battlegrounds Zilliax module dbfId |
| `"1671"` | LETTUCE_PASSIVE_ABILITY | `lettuce-passive-ability` | Mercenary ability is passive |
| `"1676"` | LETTUCE_ABILITY_SUMMONED_MINION | `lettuce-ability-summoned-minion` | Mercenary ability summons a minion |
| `"1720"` | TRADEABLE | `tradeable` | Card has the tradeable mechanic |
| `"1824"` | IN_MINI_SET | `in-mini-set` | Card belongs to the current mini-set |
| `"1852"` | LETTUCE_MERCENARY_EXPERIENCE | `lettuce-mercenary-experience` | Mercenary experience (converted to level) |
| `"1855"` | LETTUCE_EQUIPMENT | `lettuce-equipment` | Mercenary card is an equipment |
| `"2170"` | LETTUCE_IS_TREASURE_CARD | `lettuce-is-treasure-card` | Mercenary card is a treasure |
| `"2493"` | LETTUCE_ABILITY_TIER | `lettuce-ability-tier` | Mercenary ability tier (1–3) |
| `"2494"` | LETTUCE_EQUIPMENT_TIER | `lettuce-equipment-tier` | Mercenary equipment tier (1–4) |
| `"2655"` | CARDTEXT_ENTITY_0 | `cardtext-entity-0` | First referenced entity input for card text |
| `"2656"` | CARDTEXT_ENTITY_1 | `cardtext-entity-1` | Second referenced entity input for card text |
| `"2657"` | CARDTEXT_ENTITY_2 | `cardtext-entity-2` | Third referenced entity input for card text |
| `"2658"` | CARDTEXT_ENTITY_3 | `cardtext-entity-3` | Fourth referenced entity input for card text |
| `"2659"` | CARDTEXT_ENTITY_4 | `cardtext-entity-4` | Fifth referenced entity input for card text |
| `"2660"` | CARDTEXT_ENTITY_5 | `cardtext-entity-5` | Sixth referenced entity input for card text |
| `"2661"` | CARDTEXT_ENTITY_6 | `cardtext-entity-6` | Seventh referenced entity input for card text |
| `"2662"` | CARDTEXT_ENTITY_7 | `cardtext-entity-7` | Eighth referenced entity input for card text |
| `"2663"` | CARDTEXT_ENTITY_8 | `cardtext-entity-8` | Ninth referenced entity input for card text |
| `"2664"` | CARDTEXT_ENTITY_9 | `cardtext-entity-9` | Tenth referenced entity input for card text |
| `"2785"` | FORGE | `forge` | Card has the forge mechanic |
| `"2889"` | DATA_NUM_3 | `data-num-3` | {2} replacement |
| `"2890"` | CARD_NAME_DATA_1 | `card-name-data-1` | Card name {0} replacement |
| `"2919"` | DATA_NUM_4 | `data-num-4` | {3} replacement |
| `"2920"` | DATA_NUM_5 | `data-num-5` | {4} replacement |
| `"2921"` | DATA_NUM_6 | `data-num-6` | {5} replacement (optional CardDBID reference) |
| `"2946"` | HIDDEN_CHOICE_OVERRIDE | `hidden-choice-override` | Override hidden-choice text section |
| `"3499"` | BACON_TRIPLED_BASE_MINION_ID2 | `bacon-tripled-base-minion-id-2` | Second Battlegrounds Zilliax module dbfId |
| `"3500"` | BACON_TRIPLED_BASE_MINION_ID3 | `bacon-tripled-base-minion-id-3` | Third Battlegrounds Zilliax module dbfId |
| `"4161"` | DYNAMIC_KEYWORD1 | `dynamic-keyword-1` | First dynamic keyword GAME_TAG |
| `"4162"` | DYNAMIC_KEYWORD2 | `dynamic-keyword-2` | Second dynamic keyword GAME_TAG |
| `"4354"` | PREPARE | `prepare` | Card has the prepare mechanic |
| `"4503"` | TIMEWARPED | `timewarped` | Card has the Battlegrounds timewarped mechanic |
| `"4519"` | BACON_ALT_TAVERN_SYSTEM_ACTIVE | `bacon-alt-tavern-system-active` | Timewarped tavern system active |
| `"4579"` | HAS_TIMEWARPED_TAVERN_ALT_TEXT | `has-timewarped-tavern-alt-text` | Timewarped alt text index |

`WINDFURY` (189), `TAUNT` (190), `STEALTH` (191), `DIVINE_SHIELD` (194), `MAGNETIC` (849), and `REBORN` (1085) are not render-model inputs for static text reconstruction. The Battlegrounds Zilliax builder uses them only as fixed lookup keys after resolving its module dbfId from `BACON_TRIPLED_BASE_MINION_ID*`.

## Functional Requirements

The renderer must satisfy the following behavior constraints:

- return a valid PNG binary for one valid request
- render exactly one image per request
- treat `full-set` as self-contained render input; for `partial-update`, resolve the base state from internal game data using `card`
- respect `output.width` and `output.height`
- support the declared `variant` and `renderModel` needed for Hearthstone card rendering
- require `card.cardId` and `renderModel.cardId` to identify the same card
- require `style.category`, `style.zone`, `style.template`, and `style.premium` to match `variant`
- require `style.width` and `style.height` to match `output.width` and `output.height`
- require `style.transparentBackground` to match `output.transparentBackground`
- require `variant.category` to be `"glow"` exactly when `renderModel.glow` is non-empty; otherwise require `"base"`
- accept `renderModel.glow` only when `variant.zone` is `"hand"`; `"play"` renders must not carry glow markers
- render every supported `renderModel.glow` marker using its declared `buff`, `nerf`, `rework`, or `neutral` treatment
- treat the `durability` glow part as an alias of `health`
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

Requests that are structurally valid but cannot be rendered because a card, prefab, renderer, or required resource is unavailable should return `422`.

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
