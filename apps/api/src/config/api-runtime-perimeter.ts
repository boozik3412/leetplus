import type { RequestHandler } from 'express';
import type { ApiRuntimeRole } from './api-runtime-role';

const GUEST_ROUTE_PREFIXES = [
  '/guest-portal',
  '/public/guest-game/media',
] as const;
const RUNTIME_OBSERVABILITY_PATHS = new Set([
  '/health',
  '/health/live',
  '/health/ready',
  '/version',
]);

export function apiRuntimeAllowsPath(
  role: ApiRuntimeRole,
  pathname: string,
): boolean {
  if (role === 'COMBINED') return true;

  const guestRoute = GUEST_ROUTE_PREFIXES.some((prefix) =>
    pathWithinPrefix(pathname, prefix),
  );

  if (role === 'GUEST') {
    return guestRoute || RUNTIME_OBSERVABILITY_PATHS.has(pathname);
  }

  return !guestRoute;
}

export function apiRuntimePerimeter(role: ApiRuntimeRole): RequestHandler {
  return (request, response, next) => {
    if (apiRuntimeAllowsPath(role, request.path)) {
      next();
      return;
    }

    response.status(404).json({
      statusCode: 404,
      message: 'Not Found',
    });
  };
}

function pathWithinPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}
