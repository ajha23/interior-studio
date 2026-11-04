import { useState, useMemo, type FC } from 'react';
import { History, User, Clock, Filter } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useRoleManagementStore } from '@/state/roleManagementStore';
import type { RoleAuditEvent } from '@/domain/platform/authorization/types';

export const AccessAuditLog: FC = () => {
  const auditEvents = useRoleManagementStore((s) => s.auditEvents);
  const [actionFilter, setActionFilter] = useState<string>('all');

  const filteredEvents = useMemo(() => {
    if (actionFilter === 'all') return auditEvents;
    return auditEvents.filter((e) => e.actionType === actionFilter);
  }, [auditEvents, actionFilter]);

  const formatTimestamp = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return isoStr;
    }
  };

  const getActionBadge = (type: RoleAuditEvent['actionType']) => {
    switch (type) {
      case 'created':
        return <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">Created</Badge>;
      case 'updated':
        return <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20">Updated</Badge>;
      case 'cloned':
        return <Badge className="bg-purple-500/10 text-purple-600 border-purple-500/20">Cloned</Badge>;
      case 'deactivated':
        return <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20">Deactivated</Badge>;
      case 'reactivated':
        return <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">Reactivated</Badge>;
      case 'assigned':
        return <Badge className="bg-primary/10 text-primary border-primary/20">Assigned</Badge>;
      case 'unassigned':
        return <Badge variant="destructive">Unassigned</Badge>;
      default:
        return <Badge variant="outline">{type}</Badge>;
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-4 md:p-6" data-testid="access-audit-log">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            Access Control Audit Trail
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Immutable chronological timeline of all role modifications, cloning, deactivations, and member assignments.
          </p>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-2">
          <Filter className="size-4 text-muted-foreground" />
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="h-8 px-2.5 rounded-md border border-input bg-card text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            data-testid="audit-action-filter"
            aria-label="Filter audit events by action"
          >
            <option value="all">All Event Types</option>
            <option value="created">Role Created</option>
            <option value="updated">Role Updated</option>
            <option value="cloned">Role Cloned</option>
            <option value="deactivated">Role Deactivated</option>
            <option value="assigned">Member Assigned</option>
            <option value="unassigned">Member Unassigned</option>
          </select>
        </div>
      </div>

      {/* Timeline List */}
      <div className="space-y-3">
        {filteredEvents.map((event) => (
          <Card
            key={event.id}
            className="p-4 bg-card border shadow-xs transition-colors hover:bg-muted/10 text-xs"
            data-testid={`audit-event-${event.id}`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-2 mb-2.5">
              <div className="flex items-center gap-2">
                {getActionBadge(event.actionType)}
                <span className="font-semibold text-foreground">{event.roleName}</span>
              </div>

              <div className="flex items-center gap-3 text-muted-foreground text-[11px]">
                <span className="flex items-center gap-1">
                  <User className="size-3" />
                  <span>{event.actorName} ({event.actorId})</span>
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="size-3" />
                  <span>{formatTimestamp(event.timestamp)}</span>
                </span>
              </div>
            </div>

            <p className="text-foreground font-medium mb-1.5">{event.changesSummary}</p>

            {/* Diffs */}
            {(event.addedPermissions.length > 0 || event.removedPermissions.length > 0) && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {event.addedPermissions.map((p) => (
                  <span key={p} className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                    + {p}
                  </span>
                ))}
                {event.removedPermissions.map((p) => (
                  <span key={p} className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-destructive/10 text-destructive border border-destructive/20">
                    - {p}
                  </span>
                ))}
              </div>
            )}
          </Card>
        ))}

        {filteredEvents.length === 0 && (
          <div className="p-10 rounded-lg border border-dashed text-center bg-card text-muted-foreground" data-testid="audit-log-empty">
            <History className="mx-auto size-8 opacity-40 mb-2" />
            <p className="font-semibold text-foreground text-sm">No Audit Events Recorded</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Access control modifications and assignments will appear here chronologically.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
