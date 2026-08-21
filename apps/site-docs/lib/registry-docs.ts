import { traverseContractProcedures } from '@orpc/server';
import { registryContract } from '@tcg-cards/api';

import { describeSchema, type SchemaNode } from './introspect';

export type EndpointDoc = {
  game:     string;
  resource: string;
  name:     string;
  path:     string[];
  method:   string;
  tags:     string[];
  input:    SchemaNode;
  output:   SchemaNode;
};

type RouteMeta = {
  method?: string;
  tags?:   string[];
};

/** Collects all public game procedures as stable endpoint documentation records. */
export function collectEndpoints(): EndpointDoc[] {
  const endpoints: EndpointDoc[] = [];

  traverseContractProcedures({ router: registryContract, path: [] }, ({ contract, path }) => {
    if (path[0] === 'games' || path.length < 2) {
      return;
    }

    const definition = (contract as unknown as { '~orpc'?: {
      route?:        RouteMeta;
      inputSchema?:  unknown;
      outputSchema?: unknown;
    }; })['~orpc'];
    if (definition == null) {
      return;
    }

    const route = definition.route ?? {};
    const segments = path.filter(Boolean);
    endpoints.push({
      game:     segments[0] ?? '',
      resource: segments[1] ?? 'intro',
      name:     segments.at(-1) ?? 'intro',
      path:     segments,
      method:   route.method ?? 'GET',
      tags:     route.tags ?? [],
      input:    describeSchema(definition.inputSchema as never),
      output:   describeSchema(definition.outputSchema as never),
    });
  });

  return endpoints;
}

/** Finds one endpoint using URL segments after the version prefix. */
export function findEndpoint(game: string, slug: string[]): EndpointDoc | undefined {
  return collectEndpoints().find(endpoint => endpoint.game === game && endpoint.path.slice(1).join('/') === slug.join('/'));
}

/** Groups one game's endpoints by their first resource segment. */
export function groupGameEndpoints(game: string): Record<string, EndpointDoc[]> {
  const groups: Record<string, EndpointDoc[]> = {};
  for (const endpoint of collectEndpoints().filter(endpoint => endpoint.game === game)) {
    (groups[endpoint.resource] ??= []).push(endpoint);
  }
  return groups;
}

/** Returns the supported games. Display names are localized via `<id>.name`. */
export function listGames() {
  return [
    { id: 'magic' },
    { id: 'hearthstone' },
  ];
}
