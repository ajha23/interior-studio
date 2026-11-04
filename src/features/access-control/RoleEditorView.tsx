import { useState, useMemo, type FC } from 'react';
import { ArrowLeft, Shield, Sliders, Layers, Users, History, AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { PermissionMatrix } from './PermissionMatrix';
import { ResourceAccessPanel } from './ResourceAccessPanel';
import { RoleMembersTab } from './RoleMembersTab';
import { RoleSummarySidebar } from './components/RoleSummarySidebar';
import { ChangeImpactModal } from './components/ChangeImpactModal';
import { useRoleManagementStore } from '@/state/roleManagementStore';
import { useSubscriptionStore } from '@/state/subscriptionStore';
import { moduleRegistry } from '@/domain/platform/authorization/moduleRegistry';
import type { CanonicalKey } from '@/domain/platform/saas/types';

interface RoleEditorViewProps {
  onBack: () => void;
}

export const RoleEditorView: FC<RoleEditorViewProps> = ({ onBack }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'permissions' | 'scope' | 'members' | 'history'>('permissions');
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  const {
    draftRole,
    roles,
    roleMembers,
    isDirty,
    impactModalOpen,
    pendingImpact,
    updateDraftName,
    updateDraftDescription,
    updateDraftScope,
    toggleDraftPermission,
    setDraftModulePermissions,
    discardDraft,
    requestSaveDraft,
    commitSaveDraft,
    closeImpactModal,
    assignMember,
    unassignMember,
    service,
    currentOrgId,
  } = useRoleManagementStore();

  const isEntitled = useSubscriptionStore((s) => s.isEntitled);

  // Active role reference
  const selectedRole = useMemo(() => {
    if (!draftRole?.id) return null;
    return roles.find((r) => r.id === draftRole.id) || null;
  }, [roles, draftRole]);

  const isSystemRole = Boolean(selectedRole?.isSystemRole);

  // Count total and plan-restricted permissions
  const { totalAvailable, planRestrictedCount } = useMemo(() => {
    const allPerms = moduleRegistry.getAllPermissions();
    let restricted = 0;

    if (draftRole) {
      for (const permId of draftRole.permissions) {
        const def = allPerms.find((p) => p.id === permId);
        if (def?.entitlementKey && !isEntitled(def.entitlementKey as CanonicalKey)) {
          restricted++;
        }
      }
    }

    return { totalAvailable: allPerms.length, planRestrictedCount: restricted };
  }, [draftRole, isEntitled]);

  // Role audit history
  const roleAuditHistory = useMemo(() => {
    if (!draftRole?.id) return [];
    return service.getRoleAuditEvents(currentOrgId, draftRole.id);
  }, [service, currentOrgId, draftRole]);

  const handleBackClick = () => {
    if (isDirty) {
      setShowDiscardConfirm(true);
    } else {
      discardDraft();
      onBack();
    }
  };

  const handleConfirmDiscard = () => {
    discardDraft();
    setShowDiscardConfirm(false);
    onBack();
  };

  if (!draftRole) {
    return (
      <div className="p-8 text-center space-y-3">
        <p className="text-muted-foreground text-sm">No role selected for editing.</p>
        <Button onClick={onBack} size="sm" variant="outline">
          Return to Roles Dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6" data-testid="role-editor-view">
      {/* Breadcrumbs & Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <button onClick={handleBackClick} className="hover:text-foreground flex items-center gap-1">
            <ArrowLeft className="size-3.5" />
            <span>Roles & Permissions</span>
          </button>
          <span>/</span>
          <span className="font-semibold text-foreground uppercase tracking-wider">
            {isSystemRole ? 'View System Role' : 'Edit Role'}
          </span>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-3">
            <div className="size-11 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-lg">
              {draftRole.name ? draftRole.name.charAt(0).toUpperCase() : 'R'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-foreground" data-testid="editor-role-name">
                  {draftRole.name || 'Unnamed Role'}
                </h1>
                <Badge variant={isSystemRole ? 'default' : 'secondary'} className="text-xs">
                  {isSystemRole ? 'System Template' : 'Custom Role'}
                </Badge>
                {selectedRole && (
                  <Badge variant="outline" className="text-xs">
                    {roleMembers.length} {roleMembers.length === 1 ? 'member' : 'members'}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 max-w-xl">
                {draftRole.description || 'No description provided.'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs bar */}
      <div className="flex items-center gap-1 border-b pb-2 overflow-x-auto">
        <Button
          variant={activeTab === 'permissions' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setActiveTab('permissions')}
          className="gap-2 text-xs"
          data-testid="tab-permissions"
        >
          <Shield className="size-3.5" />
          <span>Permissions</span>
        </Button>

        <Button
          variant={activeTab === 'scope' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setActiveTab('scope')}
          className="gap-2 text-xs"
          data-testid="tab-scope"
        >
          <Layers className="size-3.5" />
          <span>Resource Access</span>
        </Button>

        <Button
          variant={activeTab === 'overview' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setActiveTab('overview')}
          className="gap-2 text-xs"
          data-testid="tab-overview"
        >
          <Sliders className="size-3.5" />
          <span>Overview</span>
        </Button>

        {selectedRole && (
          <Button
            variant={activeTab === 'members' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('members')}
            className="gap-2 text-xs"
            data-testid="tab-members"
          >
            <Users className="size-3.5" />
            <span>Members ({roleMembers.length})</span>
          </Button>
        )}

        {selectedRole && (
          <Button
            variant={activeTab === 'history' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('history')}
            className="gap-2 text-xs"
            data-testid="tab-history"
          >
            <History className="size-3.5" />
            <span>History</span>
          </Button>
        )}
      </div>

      {/* Main Grid: Workspace (Left) + Sticky Summary (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left Column (2 cols) */}
        <div className="lg:col-span-2 space-y-4">
          {activeTab === 'permissions' && (
            <PermissionMatrix
              grantedPermissions={draftRole.permissions}
              onTogglePermission={toggleDraftPermission}
              onSetModulePermissions={setDraftModulePermissions}
              isSystemRole={isSystemRole}
            />
          )}

          {activeTab === 'scope' && (
            <ResourceAccessPanel
              scopeType={draftRole.scopeType}
              specificProjectIds={draftRole.specificProjectIds}
              onScopeChange={updateDraftScope}
              disabled={isSystemRole}
            />
          )}

          {activeTab === 'overview' && (
            <Card className="p-6 bg-card border space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground">
                Role Identity & Ranking
              </h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">Role Name</label>
                  <Input
                    value={draftRole.name}
                    disabled={isSystemRole}
                    onChange={(e) => updateDraftName(e.target.value)}
                    className="h-9 text-sm max-w-md"
                    data-testid="editor-name-input"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">Description</label>
                  <textarea
                    value={draftRole.description}
                    disabled={isSystemRole}
                    onChange={(e) => updateDraftDescription(e.target.value)}
                    rows={3}
                    className="w-full max-w-xl rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    data-testid="editor-desc-input"
                  />
                </div>

                <div className="pt-2 text-xs text-muted-foreground">
                  <p>
                    Rank Level: <span className="font-semibold text-foreground">{draftRole.rank}</span> / 100
                  </p>
                  <p className="mt-0.5">
                    Roles with higher rank can manage and assign roles of equal or lower rank.
                  </p>
                </div>
              </div>
            </Card>
          )}

          {activeTab === 'members' && selectedRole && (
            <RoleMembersTab
              role={selectedRole}
              members={roleMembers}
              onAssignMember={(userId, userName) => assignMember(userId, selectedRole.id, userName)}
              onUnassignMember={(userId) => unassignMember(userId, selectedRole.id)}
            />
          )}

          {activeTab === 'history' && (
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Audit Timeline for this Role
              </h3>

              <div className="divide-y border rounded-lg bg-card">
                {roleAuditHistory.map((event) => (
                  <div key={event.id} className="p-3 text-xs space-y-1">
                    <div className="flex items-center justify-between text-muted-foreground text-[11px]">
                      <span className="font-semibold text-foreground uppercase">{event.actionType}</span>
                      <span>{new Date(event.timestamp).toLocaleString()}</span>
                    </div>
                    <p className="text-foreground">{event.changesSummary}</p>
                  </div>
                ))}

                {roleAuditHistory.length === 0 && (
                  <p className="p-6 text-center text-xs text-muted-foreground">
                    No historical modifications recorded for this role yet.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Sticky Sidebar (1 col) */}
        <div className="lg:sticky lg:top-6">
          <RoleSummarySidebar
            grantedCount={draftRole.permissions.size}
            totalAvailable={totalAvailable}
            planRestrictedCount={planRestrictedCount}
            resourceScope={draftRole.scopeType}
            memberCount={roleMembers.length}
            isDirty={isDirty}
            isSystemRole={isSystemRole}
            onSave={requestSaveDraft}
            onCancel={handleBackClick}
          />
        </div>
      </div>

      {/* Change Impact Modal */}
      <ChangeImpactModal
        isOpen={impactModalOpen}
        impact={pendingImpact}
        onClose={closeImpactModal}
        onConfirm={commitSaveDraft}
      />

      {/* Discard Confirmation Modal */}
      {showDiscardConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <Card className="w-full max-w-sm p-5 bg-card border shadow-xl space-y-3">
            <div className="flex items-center gap-2 text-amber-500 font-semibold text-sm">
              <AlertTriangle className="size-4" />
              <span>Discard Unsaved Changes?</span>
            </div>
            <p className="text-xs text-muted-foreground">
              You have unsaved changes in your role draft. If you navigate away now, your edits will be lost.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button size="xs" variant="outline" onClick={() => setShowDiscardConfirm(false)}>
                Continue Editing
              </Button>
              <Button size="xs" variant="destructive" onClick={handleConfirmDiscard} data-testid="confirm-discard-btn">
                Discard Changes
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};
