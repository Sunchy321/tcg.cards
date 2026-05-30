# Hearthstone Image Renderer Protocol

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

- Shared upstream model: `packages/model/src/hearthstone/schema/data/image.ts`
