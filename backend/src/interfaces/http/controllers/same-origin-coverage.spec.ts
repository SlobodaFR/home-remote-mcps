import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { SameOriginGuard } from '../guards/same-origin.guard';

const UNSAFE = new Set([
  RequestMethod.POST,
  RequestMethod.PUT,
  RequestMethod.PATCH,
  RequestMethod.DELETE,
  RequestMethod.ALL,
]);

/**
 * Mutating routes allowed to run without SameOriginGuard because they carry no session cookie.
 * Keep in sync with EXEMPT_PATHS of same-origin.middleware.ts (checked below). Everything else,
 * @Public or not, must be guarded: a new public mutation fails here until someone decides.
 */
const EXEMPT_ROUTES = new Set([
  'AuthController.disconnect', // home-auth logout webhook, shared secret
  'CookidooMcpController.handle',
  'GarminMcpController.handle',
  'HomeAssistantMcpController.handle',
  'InstagramMcpController.handle',
  'LogsMcpController.handle',
  'MarkitdownMcpController.handle',
  'OpenAiMcpController.handle',
  'PersonalHealthMcpController.handle',
  'YoutubeMcpController.handle',
]);

interface Route {
  id: string;
  controllerPath: string;
  method: RequestMethod;
  sameOriginGuarded: boolean;
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      return sourceFiles(path);
    }
    // main.ts starts the server and app.module.ts validates the environment when imported.
    const skipped = ['main.ts', 'app.module.ts'].includes(entry);
    return path.endsWith('.ts') && !path.endsWith('.spec.ts') && !skipped
      ? [path]
      : [];
  });
}

function handlersOf(prototype: object): [string, Function][] {
  const handlers = new Map<string, Function>();
  // Nest honours handlers inherited from a base class.
  for (
    let current: object | null = prototype;
    current && current !== Object.prototype;
    current = Object.getPrototypeOf(current) as object | null
  ) {
    for (const name of Object.getOwnPropertyNames(current)) {
      const value = (current as Record<string, unknown>)[name];
      if (name !== 'constructor' && typeof value === 'function') {
        handlers.set(name, handlers.get(name) ?? value);
      }
    }
  }
  return [...handlers];
}

async function allRoutes(): Promise<Route[]> {
  const routes: Route[] = [];
  const root = join(__dirname, '../../..');
  for (const file of sourceFiles(root)) {
    const module = (await import(file)) as Record<string, unknown>;
    for (const exported of Object.values(module)) {
      // A controller is whatever carries @Controller metadata, whatever its name or location.
      if (
        typeof exported !== 'function' ||
        Reflect.getMetadata(PATH_METADATA, exported) === undefined
      ) {
        continue;
      }
      const classGuards = (Reflect.getMetadata(GUARDS_METADATA, exported) ??
        []) as unknown[];
      for (const [name, handler] of handlersOf(exported.prototype as object)) {
        const method = Reflect.getMetadata(METHOD_METADATA, handler) as
          | RequestMethod
          | undefined;
        if (method === undefined) {
          continue;
        }
        const handlerGuards = (Reflect.getMetadata(GUARDS_METADATA, handler) ??
          []) as unknown[];
        routes.push({
          id: `${exported.name}.${name}`,
          controllerPath: String(Reflect.getMetadata(PATH_METADATA, exported)),
          method,
          sameOriginGuarded: [...classGuards, ...handlerGuards].includes(
            SameOriginGuard,
          ),
        });
      }
    }
  }
  return routes;
}

describe('same-origin coverage of the controllers (second layer behind the middleware)', () => {
  let routes: Route[];
  let mutating: Route[];

  beforeAll(async () => {
    routes = await allRoutes();
    mutating = routes.filter((route) => UNSAFE.has(route.method));
  });

  it('finds the routes (sanity check of the scan)', () => {
    expect(routes.map((route) => route.id)).toEqual(
      expect.arrayContaining([
        'CredentialsController.delete',
        'ApiKeysController.create',
        'AuthController.logout',
        'AuthController.disconnect',
        'GarminMcpController.handle',
      ]),
    );
  });

  it('guards every mutating route, public or not, unless it is explicitly exempt', () => {
    const unguarded = mutating
      .filter(
        (route) => !route.sameOriginGuarded && !EXEMPT_ROUTES.has(route.id),
      )
      .map((route) => route.id);

    expect(unguarded).toEqual([]);
  });

  it('keeps the exempt list honest: no stale entry, and exempt routes are never guarded', () => {
    const ids = new Set(mutating.map((route) => route.id));

    expect([...EXEMPT_ROUTES].filter((id) => !ids.has(id))).toEqual([]);
    expect(
      mutating.filter(
        (route) => EXEMPT_ROUTES.has(route.id) && route.sameOriginGuarded,
      ),
    ).toEqual([]);
  });

  // Claude's servers and home-auth never send same-origin headers: the guard would break them.
  it('mounts every exempt route where the middleware exempts it', () => {
    for (const route of mutating.filter((r) => EXEMPT_ROUTES.has(r.id))) {
      expect(
        route.controllerPath.startsWith('mcp/') ||
          route.id === 'AuthController.disconnect',
      ).toBe(true);
    }
    expect(
      mutating.filter(
        (route) =>
          route.controllerPath.startsWith('mcp/') &&
          !EXEMPT_ROUTES.has(route.id),
      ),
    ).toEqual([]);
  });
});
