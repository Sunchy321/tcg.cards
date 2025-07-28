"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.openapiDocument = exports.appRouter = void 0;
var trpc_1 = require("@/trpc");
var zod_1 = require("zod");
var index_1 = require("@interface/index");
var trpc_to_openapi_1 = require("trpc-to-openapi");
var router_1 = require("@/magic/router");
exports.appRouter = trpc_1.t.router({
    root: trpc_1.t.procedure
        .meta({ openapi: { method: 'GET', path: '/' } })
        .input(zod_1.default.void())
        .output(zod_1.default.object({
        games: zod_1.default.array(zod_1.default.enum(index_1.games)).readonly(),
    }))
        .query(function () {
        return { games: index_1.games };
    }),
    magic: router_1.gameRouter,
});
exports.openapiDocument = (0, trpc_to_openapi_1.generateOpenApiDocument)(exports.appRouter, {
    title: 'Game Server API',
    version: '1.0.0',
    description: 'API for tcg.cards',
    baseUrl: '/api',
});
