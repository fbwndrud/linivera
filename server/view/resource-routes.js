import { viewResources, viewResource, viewResourceGraph } from '../../core/view/index.js';

/** Resource routes accept only a revision identifier; root is fixed by the authenticated server. */
export const RESOURCE_ROUTES = [
  ['GET', /^\/api\/resource-graph$/, async (ctx) => ({ json: await viewResourceGraph(ctx.root) })],
  ['GET', /^\/api\/resources$/, async (ctx) => ({ json: await viewResources(ctx.root) })],
  ['GET', /^\/api\/resources\/([^/]+)$/, async (ctx, [id]) => ({ json: await viewResource(ctx.root, id) })],
];
