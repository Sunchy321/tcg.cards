# Getting Started

The TCG Cards API provides read-only access to the unified card data of multiple trading card games.

## Authentication

Every request must include an API key in the `Authorization` header:

```
Authorization: Bearer <your-api-key>
```

Requests without a key return `401`.

## First Request

```sh
curl -H "Authorization: Bearer <key>" https://api.tcg.cards/v1/magic/card/summary?cardId=abc
```
