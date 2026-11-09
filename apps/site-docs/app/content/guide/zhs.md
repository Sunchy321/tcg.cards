# 快速开始

TCG Cards API 提供对多个卡牌游戏统一卡牌数据的只读访问。

## 身份验证

每个请求都必须在 `Authorization` 请求头中携带 API 密钥:

```
Authorization: Bearer <your-api-key>
```

未携带密钥的请求将返回 `401`。

## 首次请求

```sh
curl -H "Authorization: Bearer <key>" https://api.tcg.cards/v1/magic/card/summary?cardId=abc
```
