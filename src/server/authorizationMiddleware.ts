import type {
  ActorContext,
  ActorRole,
  ResourceContext,
} from '@/domain/platform/authorization/types';
import { evaluateAuthorization } from '@/domain/platform/authorization/evaluator';

export interface AuthorizeRequestOptions {
  permission: string;
  getResourceContext?: (
    req: Request
  ) => Promise<ResourceContext | undefined> | ResourceContext | undefined;
  resolveActor?: (
    req: Request
  ) => Promise<ActorContext | null> | ActorContext | null;
}

export type RequestHandler = (req: Request) => Promise<Response>;

/**
 * Fallback actor resolver extracting identity and roles from standard headers.
 */
export function defaultHeaderActorResolver(req: Request): ActorContext | null {
  const userId = req.headers.get('x-user-id');
  const orgId = req.headers.get('x-org-id');

  if (!userId || !orgId) {
    return null;
  }

  let roles: ActorRole[] = [];
  const rolesHeader = req.headers.get('x-user-roles');
  if (rolesHeader) {
    try {
      roles = JSON.parse(rolesHeader);
    } catch {
      roles = [];
    }
  }

  return {
    id: userId,
    orgId,
    roles,
    teamId: req.headers.get('x-team-id') || undefined,
    clientId: req.headers.get('x-client-id') || undefined,
  };
}

/**
 * Direct evaluation helper for server handlers.
 */
export async function authorizeRequest(
  req: Request,
  permission: string,
  resource?: ResourceContext,
  resolveActor: (
    req: Request
  ) => Promise<ActorContext | null> | ActorContext | null = defaultHeaderActorResolver
): Promise<
  | { authorized: true; actor: ActorContext }
  | { authorized: false; response: Response }
> {
  const actor = await resolveActor(req);

  if (!actor) {
    return {
      authorized: false,
      response: new Response(
        JSON.stringify({
          ok: false,
          error: {
            code: 'unauthorized',
            message: 'Authentication required to access this resource',
          },
        }),
        {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }
      ),
    };
  }

  const evaluation = evaluateAuthorization(actor, permission, resource);

  if (!evaluation.allowed) {
    return {
      authorized: false,
      response: new Response(
        JSON.stringify({
          ok: false,
          error: {
            code: 'forbidden',
            message: 'Access denied: insufficient permissions or scope',
            reason: evaluation.reason,
            missingPermissions: evaluation.missingPermissions,
            evaluatedRoles: evaluation.evaluatedRoles,
          },
        }),
        {
          status: 403,
          headers: { 'content-type': 'application/json' },
        }
      ),
    };
  }

  return {
    authorized: true,
    actor,
  };
}

/**
 * High-order middleware wrapping server handlers with deny-by-default authorization checks.
 */
export function withAuthorization(
  handler: RequestHandler,
  options: AuthorizeRequestOptions
): RequestHandler {
  return async (req: Request): Promise<Response> => {
    const resource = options.getResourceContext
      ? await options.getResourceContext(req)
      : undefined;

    const result = await authorizeRequest(
      req,
      options.permission,
      resource,
      options.resolveActor || defaultHeaderActorResolver
    );

    if (!result.authorized) {
      return result.response;
    }

    return handler(req);
  };
}
