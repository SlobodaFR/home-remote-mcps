import type { ExecutionContext } from '@nestjs/common';
import { minutes, ThrottlerModuleOptions } from '@nestjs/throttler';

export const THROTTLE_ERROR_MESSAGE =
  'Trop de tentatives, réessayez plus tard.';

/** Admin API (cookie session): a human clicking around the SPA. */
export const API_LIMIT_PER_MINUTE = 100;
/**
 * MCP endpoints (`/api/mcp/...`): called by Claude's servers, so every request of every user of
 * the connector comes from the same few egress IPs. The transport is stateless Streamable HTTP:
 * about 3 POSTs per tool call (initialize, tools/list, tools/call), so 300/min is an order of
 * magnitude above a conversation chaining dozens of calls, and a legitimate client never reaches it.
 *
 * Limits of this safety net: the budget is per route (each of the 9 MCP controllers has its own
 * counter) and a request is counted when it starts, so a long-lived streaming response is never
 * cut. API keys are 32 random bytes, so guessing one is not the threat; the cost of an
 * unauthenticated request is: ApiKeyGuard derives a scrypt hash per stored key before deciding.
 * The limit only caps how much of the event loop one IP can burn; the real fix is to look keys up
 * by a fast hash before the scrypt check (ResolveUserFromApiKeyUseCase).
 */
export const MCP_LIMIT_PER_MINUTE = 300;

interface PathRequest {
  path: string;
}

function isMcpRoute(context: ExecutionContext): boolean {
  const { path } = context.switchToHttp().getRequest<PathRequest>();
  // Express routing is case-insensitive: match the same way.
  return path.toLowerCase().startsWith('/api/mcp/');
}

export function buildThrottlerOptions(limits: {
  api: number;
  mcp: number;
}): ThrottlerModuleOptions {
  return {
    errorMessage: THROTTLE_ERROR_MESSAGE,
    // IPv6 clients are grouped by /64, so rotating addresses inside one allocation does not
    // bypass the limit.
    ipv6SubnetPrefix: 64,
    throttlers: [
      {
        ttl: minutes(1),
        limit: (context) => (isMcpRoute(context) ? limits.mcp : limits.api),
      },
    ],
  };
}

/**
 * HTTP rate limit, applied by the global ThrottlerGuard to every route.
 *
 * - Keyed on req.ip, resolved through `trust proxy` (see configureApp / TRUST_PROXY_HOPS).
 * - Budgets are per route and per IP (the default key includes the controller and handler).
 * - In-memory storage: counters reset on restart, fine for a single instance.
 */
export const throttlerOptions = buildThrottlerOptions({
  api: API_LIMIT_PER_MINUTE,
  mcp: MCP_LIMIT_PER_MINUTE,
});
