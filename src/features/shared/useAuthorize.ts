import type {
  ResourceContext,
  ResourceScopeType,
} from '@/domain/platform/authorization/types';
import { useAuthorizationStore } from '@/state/authorizationStore';

export interface UseAuthorizeResult {
  allowed: boolean;
  loading: boolean;
  reason?: string;
  scope?: ResourceScopeType;
}

/**
 * Declarative React hook for adaptive UI permission checks.
 * Integrates with central authorization store to dynamically disable,
 * hide, or decorate buttons and navigation items.
 */
export function useAuthorize(
  permissionId: string,
  resourceContext?: ResourceContext
): UseAuthorizeResult {
  const isLoading = useAuthorizationStore((s) => s.isLoading);
  const can = useAuthorizationStore((s) => s.can);

  if (isLoading) {
    return {
      allowed: false,
      loading: true,
    };
  }

  const result = can(permissionId, resourceContext);

  return {
    allowed: result.allowed,
    loading: false,
    reason: result.reason,
    scope: result.applicableScope,
  };
}
