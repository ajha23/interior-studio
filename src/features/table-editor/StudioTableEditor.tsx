import { useId, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  CreditCard,
  Database,
  Download,
  FolderGit2,
  History,
  Lock,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  type ClientRecord,
  type ConsentRecord,
  eraseClientData,
  exportClientData,
  isConsentActive,
  toSafeClient,
} from '@/domain/platform/dpdp';
import { type AuditRecord, createAuditEvent } from '@/domain/platform/audit';
import { type Role, ROLE_RANK } from '@/domain/platform/rbac';
import { useEditorStore } from '@/state/editorStore';
import { BillingSettingsView } from '@/features/billing/BillingSettingsView';
import { RoleManagementPanel } from './RoleManagementPanel';
import { AdminRoleService } from '@/domain/platform/authorization/adminRoleService';

export type TableTab = 'clients' | 'projects' | 'members' | 'roles' | 'audit' | 'billing';

export interface StudioMember {
  id: string;
  name: string;
  email: string;
  role: Role;
  joinedAt: string;
}

export interface StudioTableEditorProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserRole?: Role;
  initialClients?: ClientRecord[];
  initialConsents?: ConsentRecord[];
  initialMembers?: StudioMember[];
  initialAuditLogs?: AuditRecord[];
}

const DEFAULT_MEMBERS: StudioMember[] = [
  { id: 'usr_owner_01', name: 'Mihir Sharma', email: 'mihir@interiorstudio.in', role: 'owner', joinedAt: '2024-01-15' },
  { id: 'usr_admin_02', name: 'Aarav Patel', email: 'aarav@interiorstudio.in', role: 'admin', joinedAt: '2024-03-10' },
  { id: 'usr_des_03', name: 'Priya Sundaram', email: 'priya@interiorstudio.in', role: 'designer', joinedAt: '2024-06-01' },
  { id: 'usr_prod_04', name: 'Rajesh Kumar', email: 'rajesh@interiorstudio.in', role: 'production', joinedAt: '2024-07-20' },
  { id: 'usr_view_05', name: 'Kavita Verma', email: 'kavita@client.in', role: 'viewer', joinedAt: '2024-10-05' },
];

const DEFAULT_CLIENTS: ClientRecord[] = [
  {
    id: 'cli_01',
    orgId: 'org_inhouse_01',
    name: 'Vikram Malhotra',
    mobile: '9876543210',
    email: 'vikram.malhotra@example.com',
    siteAddress: '402 Prestige Palms, Indiranagar, Bengaluru, KA',
    gstin: '29ABCDE1234F1Z5',
    consentId: 'cns_01',
  },
  {
    id: 'cli_02',
    orgId: 'org_inhouse_01',
    name: 'Ananya Deshmukh',
    mobile: '9123456789',
    email: 'ananya.d@example.com',
    siteAddress: 'Flat 12B, Hiranandani Gardens, Powai, Mumbai, MH',
    gstin: '27AABCU9603R1ZM',
    consentId: 'cns_02',
  },
];

const DEFAULT_CONSENTS: ConsentRecord[] = [
  {
    id: 'cns_01',
    orgId: 'org_inhouse_01',
    noticeVersion: 'v2.0-2024',
    purpose: 'Interior design services and statutory GST billing',
    capturedAt: '2024-08-15T10:00:00Z',
    withdrawnAt: null,
  },
  {
    id: 'cns_02',
    orgId: 'org_inhouse_01',
    noticeVersion: 'v2.0-2024',
    purpose: 'Interior design services and quotation estimation',
    capturedAt: '2024-09-01T14:30:00Z',
    withdrawnAt: null,
  },
];

const DEFAULT_AUDIT_LOGS: AuditRecord[] = [
  {
    id: 'aud_01',
    orgId: 'org_inhouse_01',
    actorId: 'usr_owner_01',
    eventFamily: 'auth',
    eventAction: 'user.login',
    resourceType: 'session',
    resourceId: 'sess_99',
    metadata: { method: 'sso_google' },
    ipAddress: '106.51.24.12',
    createdAt: '2024-11-01T08:30:00Z',
  },
  {
    id: 'aud_02',
    orgId: 'org_inhouse_01',
    actorId: 'usr_des_03',
    eventFamily: 'quotes',
    eventAction: 'quote.generated',
    resourceType: 'quotation',
    resourceId: 'qt_2024_001',
    metadata: { totalPaise: 45000000, cgstPaise: 4050000, sgstPaise: 4050000 },
    ipAddress: '106.51.24.18',
    createdAt: '2024-11-01T10:15:00Z',
  },
];

export function StudioTableEditor({
  isOpen,
  onClose,
  currentUserRole = 'owner',
  initialClients = DEFAULT_CLIENTS,
  initialConsents = DEFAULT_CONSENTS,
  initialMembers = DEFAULT_MEMBERS,
  initialAuditLogs = DEFAULT_AUDIT_LOGS,
}: StudioTableEditorProps) {
  const currentProject = useEditorStore((s) => s.project);
  const searchInputId = useId();
  const [activeTab, setActiveTab] = useState<TableTab>('clients');
  const [searchQuery, setSearchQuery] = useState('');
  const [clients, setClients] = useState<ClientRecord[]>(initialClients);
  const [consents] = useState<ConsentRecord[]>(initialConsents);
  const [members] = useState<StudioMember[]>(initialMembers);
  const [auditLogs, setAuditLogs] = useState<AuditRecord[]>(initialAuditLogs);
  const [expandedAuditId, setExpandedAuditId] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [adminService] = useState(() => new AdminRoleService());

  if (!isOpen) return null;

  const isOwner = currentUserRole === 'owner';
  const isAdmin = currentUserRole === 'admin';
  const canViewPii = isOwner || isAdmin;

  // Filter clients
  const filteredClients = clients.filter((c) => {
    const q = searchQuery.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.mobile.includes(q) ||
      (c.email && c.email.toLowerCase().includes(q)) ||
      (c.siteAddress && c.siteAddress.toLowerCase().includes(q))
    );
  });

  // Filter members
  const filteredMembers = members.filter((m) => {
    const q = searchQuery.toLowerCase();
    return m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q) || m.role.toLowerCase().includes(q);
  });

  // Filter audit logs
  const filteredAuditLogs = auditLogs.filter((a) => {
    const q = searchQuery.toLowerCase();
    return (
      a.eventAction.toLowerCase().includes(q) ||
      a.eventFamily.toLowerCase().includes(q) ||
      a.actorId.toLowerCase().includes(q) ||
      a.resourceType.toLowerCase().includes(q)
    );
  });

  const handleExportClient = (client: ClientRecord) => {
    const consent = consents.find((c) => c.id === client.consentId) || null;
    const projectIds = currentProject ? [currentProject.id] : [];
    const exportBundle = exportClientData(client, consent, projectIds);

    const blob = new Blob([JSON.stringify(exportBundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `DPDP-Export-${client.id}-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setFeedbackMessage(`Exported DPDP data bundle for ${client.name}.`);
    setTimeout(() => setFeedbackMessage(null), 4000);
  };

  const handleEraseClient = (client: ClientRecord) => {
    const confirmMessage = `DPDP Right to Erasure: Are you sure you want to permanently erase personal data for ${client.name}? Statutory financial and design geometry will be retained in anonymized format.`;
    if (!window.confirm(confirmMessage)) return;

    const { erasedClient, auditPayload } = eraseClientData(client);

    setClients((prev) => prev.map((c) => (c.id === client.id ? erasedClient : c)));

    // Record immutable audit entry
    const auditRecord = createAuditEvent({
      orgId: client.orgId,
      actorId: 'usr_owner_01',
      eventFamily: 'clients',
      eventAction: 'client.erased',
      resourceType: 'client',
      resourceId: client.id,
      metadata: auditPayload,
    });

    setAuditLogs((prev) => [auditRecord, ...prev]);

    setFeedbackMessage(`Personal data for ${client.id} erased under DPDP Section 12.`);
    setTimeout(() => setFeedbackMessage(null), 5000);
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
      role="dialog"
      aria-label="Studio Data Tables"
      data-testid="studio-table-editor-dialog"
    >
      <div
        className="flex h-[90vh] w-[min(1200px,100%)] flex-col overflow-hidden rounded-xl bg-card shadow-2xl border"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex items-center justify-between border-b px-6 py-3.5 bg-muted/20">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Database className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold leading-tight">Studio Table Editor</h2>
                <Badge className={isOwner ? 'bg-primary text-primary-foreground text-[11px]' : 'bg-secondary text-secondary-foreground text-[11px]'}>
                  {currentUserRole.toUpperCase()} ACCESS
                </Badge>
                <Badge className="text-[11px] gap-1 text-emerald-600 border-emerald-300">
                  <ShieldCheck className="size-3" /> DPDP-2023 Compliant
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                In-app governance grid for Clients, Projects, Team, and Append-Only Audit Logs (SEC-08)
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close table editor">
            <X className="size-4" />
          </Button>
        </header>

        {/* Tab Navigation & Search Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-2.5 bg-background">
          <div className="flex rounded-lg border p-1 bg-muted/30" role="tablist" aria-label="Table Tabs">
            <Button
              size="xs"
              variant={activeTab === 'clients' ? 'selected' : 'ghost'}
              role="tab"
              aria-selected={activeTab === 'clients'}
              onClick={() => setActiveTab('clients')}
              className="gap-1.5"
            >
              <Users className="size-3.5" />
              Clients ({clients.length})
            </Button>
            <Button
              size="xs"
              variant={activeTab === 'projects' ? 'selected' : 'ghost'}
              role="tab"
              aria-selected={activeTab === 'projects'}
              onClick={() => setActiveTab('projects')}
              className="gap-1.5"
            >
              <FolderGit2 className="size-3.5" />
              Projects (1)
            </Button>
            <Button
              size="xs"
              variant={activeTab === 'members' ? 'selected' : 'ghost'}
              role="tab"
              aria-selected={activeTab === 'members'}
              onClick={() => setActiveTab('members')}
              className="gap-1.5"
            >
              <ShieldAlert className="size-3.5" />
              Team Members ({members.length})
            </Button>
            <Button
              size="xs"
              variant={activeTab === 'roles' ? 'selected' : 'ghost'}
              role="tab"
              aria-selected={activeTab === 'roles'}
              onClick={() => setActiveTab('roles')}
              className="gap-1.5"
              data-testid="tab-roles-btn"
            >
              <ShieldCheck className="size-3.5" />
              Roles & Scopes
            </Button>
            <Button
              size="xs"
              variant={activeTab === 'audit' ? 'selected' : 'ghost'}
              role="tab"
              aria-selected={activeTab === 'audit'}
              onClick={() => setActiveTab('audit')}
              className="gap-1.5"
            >
              <History className="size-3.5" />
              Audit Log ({auditLogs.length})
            </Button>
            <Button
              size="xs"
              variant={activeTab === 'billing' ? 'selected' : 'ghost'}
              role="tab"
              aria-selected={activeTab === 'billing'}
              onClick={() => setActiveTab('billing')}
              className="gap-1.5"
              data-testid="tab-billing-btn"
            >
              <CreditCard className="size-3.5" />
              Billing & Plans
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <label htmlFor={searchInputId} className="sr-only">
                Search table records
              </label>
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                id={searchInputId}
                placeholder={`Search ${activeTab}...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 w-64 pl-8 text-xs"
                aria-label="Search records"
              />
            </div>
          </div>
        </div>

        {/* Feedback / Alert Banner */}
        {feedbackMessage && (
          <div className="flex items-center justify-between bg-primary/10 px-6 py-2 text-xs font-medium text-primary border-b animate-in fade-in">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-4" />
              <span>{feedbackMessage}</span>
            </div>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setFeedbackMessage(null)}
              aria-label="Dismiss feedback"
            >
              <X className="size-3" />
            </Button>
          </div>
        )}

        {/* Main Grid View */}
        <div className="flex-1 overflow-auto p-6">
          {/* TAB 1: CLIENTS */}
          {activeTab === 'clients' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold">Clients Registry</h3>
                  <p className="text-xs text-muted-foreground">
                    Client contact details, statutory GSTINs, and consent telemetry with DPDP masking
                  </p>
                </div>
                {!canViewPii && (
                  <Badge className="gap-1 text-amber-600 border-amber-300">
                    <Lock className="size-3" /> PII Masked for role '{currentUserRole}'
                  </Badge>
                )}
              </div>

              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-left text-xs" data-testid="clients-table">
                  <thead className="border-b bg-muted/40 font-medium text-muted-foreground">
                    <tr>
                      <th className="py-2.5 px-3">Client</th>
                      <th className="py-2.5 px-3">Contact Details</th>
                      <th className="py-2.5 px-3">Site Address</th>
                      <th className="py-2.5 px-3">GSTIN</th>
                      <th className="py-2.5 px-3">DPDP Consent</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredClients.map((client) => {
                      const safeClient = toSafeClient(client, canViewPii);
                      const consent = consents.find((c) => c.id === client.consentId);
                      const activeConsent = isConsentActive(consent);
                      const isAnonymized = client.name === 'Anonymized Client';

                      return (
                        <tr key={client.id} className="hover:bg-muted/10 transition-colors">
                          <td className="py-2.5 px-3 font-medium">
                            <div className="flex flex-col">
                              <span className={isAnonymized ? 'italic text-muted-foreground' : 'font-medium'}>
                                {safeClient.name}
                              </span>
                              <span className="text-[10px] text-muted-foreground font-mono">{client.id}</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex flex-col">
                              <span>{safeClient.mobile}</span>
                              <span className="text-muted-foreground">{safeClient.email || '—'}</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 max-w-xs truncate" title={safeClient.siteAddress || undefined}>
                            {safeClient.siteAddress || '—'}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[11px]">{safeClient.gstin || 'Unregistered'}</td>
                          <td className="py-2.5 px-3">
                            {consent ? (
                              <Badge
                                className={`text-[10px] gap-1 ${
                                  activeConsent
                                    ? 'text-emerald-600 border-emerald-300'
                                    : 'text-rose-600 border-rose-300'
                                }`}
                              >
                                {activeConsent ? (
                                  <>
                                    <CheckCircle2 className="size-3" /> {consent.noticeVersion}
                                  </>
                                ) : (
                                  <>
                                    <AlertCircle className="size-3" /> Withdrawn
                                  </>
                                )}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-[11px]">No Consent</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                size="xs"
                                variant="outline"
                                onClick={() => handleExportClient(client)}
                                title="Export DPDP Portability Bundle (JSON)"
                                className="h-7 gap-1"
                                data-testid={`export-dpdp-${client.id}`}
                              >
                                <Download className="size-3" /> Export
                              </Button>
                              {isOwner && !isAnonymized && (
                                <Button
                                  size="xs"
                                  variant="destructive"
                                  onClick={() => handleEraseClient(client)}
                                  title="Statutory DPDP Erasure (Redact PII)"
                                  className="h-7 gap-1"
                                  data-testid={`erase-dpdp-${client.id}`}
                                >
                                  <Trash2 className="size-3" /> Erase
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: PROJECTS */}
          {activeTab === 'projects' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold">Active Studio Projects</h3>
                  <p className="text-xs text-muted-foreground">
                    Project geometric models, revision lifecycles, and associated client accounts
                  </p>
                </div>
              </div>

              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-left text-xs" data-testid="projects-table">
                  <thead className="border-b bg-muted/40 font-medium text-muted-foreground">
                    <tr>
                      <th className="py-2.5 px-3">Project Name</th>
                      <th className="py-2.5 px-3">Project ID</th>
                      <th className="py-2.5 px-3">Room Type</th>
                      <th className="py-2.5 px-3">Cabinet Units</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Revision</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {currentProject ? (
                      <tr className="hover:bg-muted/10">
                        <td className="py-2.5 px-3 font-medium flex items-center gap-2">
                          <FolderGit2 className="size-4 text-primary" />
                          {currentProject.name}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px] text-muted-foreground">
                          {currentProject.id}
                        </td>
                        <td className="py-2.5 px-3 capitalize">Kitchen</td>
                        <td className="py-2.5 px-3">{currentProject.cabinets?.length ?? 0} modules</td>
                        <td className="py-2.5 px-3">
                          <Badge className="text-emerald-600 border-emerald-300">
                            Active Design
                          </Badge>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px]">rev-01</td>
                      </tr>
                    ) : (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-muted-foreground">
                          No active project currently loaded.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: TEAM MEMBERS & RBAC */}
          {activeTab === 'members' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold">Studio Team & Role Hierarchy</h3>
                  <p className="text-xs text-muted-foreground">
                    Role-Based Access Control ranks and permissions across studio workspace
                  </p>
                </div>
              </div>

              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-left text-xs" data-testid="members-table">
                  <thead className="border-b bg-muted/40 font-medium text-muted-foreground">
                    <tr>
                      <th className="py-2.5 px-3">Member</th>
                      <th className="py-2.5 px-3">Email</th>
                      <th className="py-2.5 px-3">Role</th>
                      <th className="py-2.5 px-3">Rank</th>
                      <th className="py-2.5 px-3">Joined Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredMembers.map((member) => (
                      <tr key={member.id} className="hover:bg-muted/10">
                        <td className="py-2.5 px-3 font-medium flex items-center gap-2">
                          <Users className="size-3.5 text-muted-foreground" />
                          {member.name}
                        </td>
                        <td className="py-2.5 px-3 text-muted-foreground">{member.email}</td>
                        <td className="py-2.5 px-3">
                          <Badge
                            className={`text-[11px] ${
                              member.role === 'owner'
                                ? 'bg-primary text-primary-foreground'
                                : member.role === 'admin'
                                ? 'bg-secondary text-secondary-foreground'
                                : ''
                            }`}
                          >
                            {member.role.toUpperCase()}
                          </Badge>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px]">{ROLE_RANK[member.role]}/100</td>
                        <td className="py-2.5 px-3 text-muted-foreground">{member.joinedAt}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3.5: ROLES & SCOPES */}
          {activeTab === 'roles' && (
            <div className="space-y-4">
              <RoleManagementPanel
                adminService={adminService}
                orgId="org_inhouse_01"
                actorRank={ROLE_RANK[currentUserRole]}
              />
            </div>
          )}

          {/* TAB 4: AUDIT LOG */}
          {activeTab === 'audit' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold">Immutable Append-Only Audit Trail</h3>
                  <p className="text-xs text-muted-foreground">
                    Tamper-evident logs of all security, commercial, and DPDP actions (SEC-06, SEC-07)
                  </p>
                </div>
              </div>

              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-left text-xs" data-testid="audit-table">
                  <thead className="border-b bg-muted/40 font-medium text-muted-foreground">
                    <tr>
                      <th className="py-2.5 px-3">Timestamp</th>
                      <th className="py-2.5 px-3">Actor</th>
                      <th className="py-2.5 px-3">Family</th>
                      <th className="py-2.5 px-3">Action</th>
                      <th className="py-2.5 px-3">Resource</th>
                      <th className="py-2.5 px-3 text-right">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredAuditLogs.map((log) => {
                      const isExpanded = expandedAuditId === log.id;
                      return (
                        <tr key={log.id} className="hover:bg-muted/10">
                          <td className="py-2.5 px-3 font-mono text-[11px] text-muted-foreground">
                            {new Date(log.createdAt).toLocaleString()}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[11px]">{log.actorId}</td>
                          <td className="py-2.5 px-3">
                            <Badge className="text-[10px]">
                              {log.eventFamily}
                            </Badge>
                          </td>
                          <td className="py-2.5 px-3 font-medium font-mono text-[11px]">{log.eventAction}</td>
                          <td className="py-2.5 px-3 text-muted-foreground">
                            {log.resourceType}:{log.resourceId}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <Button
                              size="xs"
                              variant="ghost"
                              onClick={() => setExpandedAuditId(isExpanded ? null : log.id)}
                              className="h-6 px-2 text-[10px]"
                            >
                              {isExpanded ? 'Hide' : 'Inspect'}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Expanded JSON Inspector */}
              {expandedAuditId && (
                <div className="rounded-lg border bg-muted/20 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold">Audit Record Payload ({expandedAuditId})</span>
                    <Button size="xs" variant="ghost" onClick={() => setExpandedAuditId(null)}>
                      <X className="size-3" />
                    </Button>
                  </div>
                  <pre className="overflow-x-auto rounded bg-card p-3 text-[11px] font-mono text-foreground border">
                    {JSON.stringify(
                      auditLogs.find((l) => l.id === expandedAuditId),
                      null,
                      2
                    )}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* TAB 5: BILLING & SUBSCRIPTIONS */}
          {activeTab === 'billing' && <BillingSettingsView />}
        </div>
      </div>
    </div>
  );
}
