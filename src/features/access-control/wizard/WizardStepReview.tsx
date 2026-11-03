import { useMemo, type FC } from 'react';
import { AlertTriangle, Lock, CheckCircle2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { moduleRegistry } from '@/domain/platform/authorization/moduleRegistry';
import { useSubscriptionStore } from '@/state/subscriptionStore';
import type { ResourceScopeType } from '@/domain/platform/authorization/types';
import type { CanonicalKey } from '@/domain/platform/saas/types';

interface WizardStepReviewProps {
  name: string;
  description: string;
  rank: number;
  scopeType: ResourceScopeType;
  specificProjectIds: string[];
  grantedPermissions: Set<string>;
}

export const WizardStepReview: FC<WizardStepReviewProps> = ({
  name,
  description,
  scopeType,
  specificProjectIds,
  grantedPermissions,
}) => {
  const isEntitled = useSubscriptionStore((s) => s.isEntitled);

  const { moduleBreakdown, highRiskList, restrictedCount } = useMemo(() => {
    const allPerms = moduleRegistry.getAllPermissions();
    const modules = moduleRegistry.getRegisteredModules();

    const breakdown: Array<{
      moduleName: string;
      granted: string[];
    }> = [];

    const highRisk: string[] = [];
    let restricted = 0;

    for (const mod of modules) {
      const modPerms = allPerms.filter((p) => p.moduleId === mod.id);
      const grantedForMod = modPerms.filter((p) => grantedPermissions.has(p.id));

      if (grantedForMod.length > 0) {
        breakdown.push({
          moduleName: mod.name,
          granted: grantedForMod.map((p) => p.title),
        });

        for (const p of grantedForMod) {
          if (p.isHighRisk) {
            highRisk.push(p.title);
          }
          if (p.entitlementKey && !isEntitled(p.entitlementKey as CanonicalKey)) {
            restricted++;
          }
        }
      }
    }

    return {
      moduleBreakdown: breakdown,
      highRiskList: highRisk,
      restrictedCount: restricted,
    };
  }, [grantedPermissions, isEntitled]);

  const formatScopeLabel = (scope: ResourceScopeType) => {
    switch (scope) {
      case 'all_projects':
        return 'All Organization Projects';
      case 'assigned_projects':
        return 'Assigned Projects Only';
      case 'team_projects':
        return 'Team Projects Only';
      case 'specific_projects':
        return `Specific Projects (${specificProjectIds.length} designated)`;
      default:
        return 'All Projects';
    }
  };

  return (
    <div className="space-y-6" data-testid="wizard-step-review">
      <div>
        <h3 className="text-base font-semibold text-foreground">Step 3: Review & Summary</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Verify configuration details, high-risk security privileges, and plan availability before creating this role.
        </p>
      </div>

      {/* Basic Role Overview */}
      <Card className="p-4 bg-card border space-y-3">
        <div className="flex items-start justify-between">
          <div>
            <h4 className="text-base font-bold text-foreground" data-testid="review-role-name">{name}</h4>
            {description ? (
              <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
            ) : (
              <p className="text-xs italic text-muted-foreground mt-0.5">No description provided</p>
            )}
          </div>
          <Badge className="bg-primary/10 text-primary border-primary/20">
            Custom Role
          </Badge>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t text-xs">
          <div>
            <span className="text-muted-foreground">Resource Scope:</span>
            <p className="font-semibold text-foreground mt-0.5" data-testid="review-scope">
              {formatScopeLabel(scopeType)}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground">Total Permissions:</span>
            <p className="font-semibold text-foreground mt-0.5" data-testid="review-perm-count">
              {grantedPermissions.size} granted
            </p>
          </div>
          <div>
            <span className="text-muted-foreground">Plan Restrictions:</span>
            <p className={`font-semibold mt-0.5 ${restrictedCount > 0 ? 'text-amber-600' : 'text-emerald-600'}`} data-testid="review-restricted-count">
              {restrictedCount > 0 ? `${restrictedCount} capabilities restricted` : 'All entitled'}
            </p>
          </div>
        </div>
      </Card>

      {/* High-Risk Privileges Callout */}
      {highRiskList.length > 0 && (
        <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 space-y-2">
          <div className="flex items-center gap-2 text-destructive font-semibold text-xs">
            <AlertTriangle className="size-4 shrink-0" />
            <span>High-Risk Privileges Granted ({highRiskList.length})</span>
          </div>
          <p className="text-xs text-destructive/90">
            This role includes administrative or destructive capabilities. Ensure members assigned to this role are authorized to perform these actions:
          </p>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {highRiskList.map((title) => (
              <Badge key={title} variant="destructive" className="text-[11px]">
                {title}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Plan Restrictions Callout */}
      {restrictedCount > 0 && (
        <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 space-y-1.5 text-xs text-amber-700">
          <div className="flex items-center gap-2 font-semibold">
            <Lock className="size-4 shrink-0" />
            <span>Subscription Plan Notice</span>
          </div>
          <p className="text-[11px] text-amber-700/90 leading-relaxed">
            {restrictedCount} granted capabilities are restricted under your tenant's current plan. These grants will be recorded in the role definition but will not be executable until your organization upgrades to Pro Studio.
          </p>
        </div>
      )}

      {/* Module Breakdown */}
      <div className="space-y-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Granted Capabilities by Module
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {moduleBreakdown.map((item) => (
            <Card key={item.moduleName} className="p-3 text-xs bg-muted/20">
              <div className="flex items-center justify-between font-semibold text-foreground mb-2">
                <span>{item.moduleName}</span>
                <span className="text-[11px] text-muted-foreground font-normal">
                  {item.granted.length} actions
                </span>
              </div>
              <ul className="space-y-1 text-muted-foreground">
                {item.granted.map((title) => (
                  <li key={title} className="flex items-center gap-1.5">
                    <CheckCircle2 className="size-3 text-primary shrink-0" />
                    <span>{title}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};
