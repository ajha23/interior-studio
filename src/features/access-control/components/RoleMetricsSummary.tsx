import type { FC } from 'react';
import { Shield, Users, UserCheck, AlertCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';

interface RoleMetricsSummaryProps {
  totalRoles: number;
  customRoles: number;
  assignedUsers: number;
  planRestrictedRoles: number;
}

export const RoleMetricsSummary: FC<RoleMetricsSummaryProps> = ({
  totalRoles,
  customRoles,
  assignedUsers,
  planRestrictedRoles,
}) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="role-metrics-summary">
      <Card className="p-4 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Roles</p>
          <p className="text-2xl font-bold mt-1 text-foreground" data-testid="metric-total-roles">{totalRoles}</p>
          <p className="text-xs text-muted-foreground mt-0.5">System & custom roles</p>
        </div>
        <div className="size-10 rounded-full bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
          <Shield className="size-5" />
        </div>
      </Card>

      <Card className="p-4 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Custom Roles</p>
          <p className="text-2xl font-bold mt-1 text-foreground" data-testid="metric-custom-roles">{customRoles}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Tailored permissions</p>
        </div>
        <div className="size-10 rounded-full bg-purple-500/10 text-purple-500 flex items-center justify-center shrink-0">
          <Users className="size-5" />
        </div>
      </Card>

      <Card className="p-4 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Users Assigned</p>
          <p className="text-2xl font-bold mt-1 text-foreground" data-testid="metric-assigned-users">{assignedUsers}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Active organization members</p>
        </div>
        <div className="size-10 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
          <UserCheck className="size-5" />
        </div>
      </Card>

      <Card className="p-4 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Plan Restricted</p>
          <p className="text-2xl font-bold mt-1 text-foreground" data-testid="metric-plan-restricted">{planRestrictedRoles}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Requiring tier upgrade</p>
        </div>
        <div className="size-10 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
          <AlertCircle className="size-5" />
        </div>
      </Card>
    </div>
  );
};
