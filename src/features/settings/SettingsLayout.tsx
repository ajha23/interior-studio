import { useState, type FC } from 'react';
import { Shield, History, PlayCircle, CreditCard, ChevronRight, ArrowLeft } from 'lucide-react';
import { RolesDashboard } from '@/features/access-control/RolesDashboard';
import { RoleEditorView } from '@/features/access-control/RoleEditorView';
import { CreateRoleWizard } from '@/features/access-control/CreateRoleWizard';
import { AccessAuditLog } from '@/features/access-control/AccessAuditLog';
import { AccessPreviewSimulator } from '@/features/access-control/AccessPreviewSimulator';
import { BillingSettingsView } from '@/features/billing/BillingSettingsView';
import { Button } from '@/components/ui/button';

export type SettingsSection = 'roles' | 'audit' | 'simulator' | 'billing';
export type RolesViewMode = 'dashboard' | 'editor' | 'wizard';

interface SettingsLayoutProps {
  initialSection?: SettingsSection;
  onClose?: () => void;
}

export const SettingsLayout: FC<SettingsLayoutProps> = ({
  initialSection = 'roles',
  onClose,
}) => {
  const [activeSection, setActiveSection] = useState<SettingsSection>(initialSection);
  const [rolesViewMode, setRolesViewMode] = useState<RolesViewMode>('dashboard');

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-background" data-testid="settings-layout">
      {/* Sidebar Navigation */}
      <aside className="w-full lg:w-64 border-b lg:border-b-0 lg:border-r bg-muted/20 p-4 space-y-6 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="font-bold text-base tracking-tight text-foreground">Studio Settings</h2>
          </div>
          {onClose && (
            <Button
              variant="ghost"
              size="xs"
              onClick={onClose}
              className="text-xs text-muted-foreground"
              data-testid="settings-back-btn"
            >
              <ArrowLeft className="size-3.5 mr-1" />
              <span>Back</span>
            </Button>
          )}
        </div>

        {/* ACCESS & SECURITY SECTION */}
        <div className="space-y-1.5">
          <p className="px-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Access & Security
          </p>

          <button
            type="button"
            onClick={() => {
              setActiveSection('roles');
              setRolesViewMode('dashboard');
            }}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-colors ${
              activeSection === 'roles'
                ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                : 'text-foreground hover:bg-muted'
            }`}
            data-testid="nav-roles"
          >
            <div className="flex items-center gap-2.5">
              <Shield className="size-4" />
              <span>Roles & Permissions</span>
            </div>
            <ChevronRight className="size-3 opacity-60" />
          </button>

          <button
            type="button"
            onClick={() => setActiveSection('simulator')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-colors ${
              activeSection === 'simulator'
                ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                : 'text-foreground hover:bg-muted'
            }`}
            data-testid="nav-simulator"
          >
            <div className="flex items-center gap-2.5">
              <PlayCircle className="size-4" />
              <span>Access Simulator</span>
            </div>
            <ChevronRight className="size-3 opacity-60" />
          </button>

          <button
            type="button"
            onClick={() => setActiveSection('audit')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-colors ${
              activeSection === 'audit'
                ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                : 'text-foreground hover:bg-muted'
            }`}
            data-testid="nav-audit"
          >
            <div className="flex items-center gap-2.5">
              <History className="size-4" />
              <span>Access Audit Log</span>
            </div>
            <ChevronRight className="size-3 opacity-60" />
          </button>
        </div>

        {/* BILLING & SUBSCRIPTION SECTION (KEPT SEPARATE PER UX SPEC) */}
        <div className="space-y-1.5 pt-4 border-t">
          <p className="px-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Billing & Subscription
          </p>

          <button
            type="button"
            onClick={() => setActiveSection('billing')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-colors ${
              activeSection === 'billing'
                ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                : 'text-foreground hover:bg-muted'
            }`}
            data-testid="nav-billing"
          >
            <div className="flex items-center gap-2.5">
              <CreditCard className="size-4" />
              <span>Plans & Invoices</span>
            </div>
            <ChevronRight className="size-3 opacity-60" />
          </button>
        </div>
      </aside>

      {/* Main Workspace Area */}
      <main className="flex-1 p-2 md:p-6 overflow-y-auto">
        {activeSection === 'roles' && (
          <>
            {rolesViewMode === 'dashboard' && (
              <RolesDashboard
                onNavigateToEditor={() => setRolesViewMode('editor')}
                onNavigateToWizard={() => setRolesViewMode('wizard')}
              />
            )}
            {rolesViewMode === 'editor' && (
              <RoleEditorView onBack={() => setRolesViewMode('dashboard')} />
            )}
            {rolesViewMode === 'wizard' && (
              <CreateRoleWizard
                onCancel={() => setRolesViewMode('dashboard')}
                onSuccess={() => setRolesViewMode('dashboard')}
              />
            )}
          </>
        )}

        {activeSection === 'simulator' && <AccessPreviewSimulator />}

        {activeSection === 'audit' && <AccessAuditLog />}

        {activeSection === 'billing' && <BillingSettingsView />}
      </main>
    </div>
  );
};
