import { beforeAll, describe, expect, it } from 'vitest';
import { bootstrapModuleRegistry } from './bootstrap';
import { evaluateAuthorization } from './evaluator';
import { moduleRegistry } from './moduleRegistry';
import type { ActorContext, ResourceContext } from './types';

describe('Comprehensive Module Authorization Matrix (US5, Principle VI)', () => {
  beforeAll(() => {
    bootstrapModuleRegistry();
  });

  const orgId = 'org_test_matrix_01';

  // System role actors
  const ownerActor: ActorContext = {
    id: 'user_owner',
    orgId,
    roles: [
      {
        roleId: 'owner',
        status: 'active',
        permissions: [
          { permissionId: 'org:manage', scopeType: 'all_projects' },
          { permissionId: 'members:manage', scopeType: 'all_projects' },
          { permissionId: 'projects:read', scopeType: 'all_projects' },
          { permissionId: 'projects:write', scopeType: 'all_projects' },
          { permissionId: 'projects:delete', scopeType: 'all_projects' },
          { permissionId: 'floor_plans:read', scopeType: 'all_projects' },
          { permissionId: 'floor_plans:write', scopeType: 'all_projects' },
          { permissionId: 'designs.2d.view', scopeType: 'all_projects' },
          { permissionId: 'designs.3d.view', scopeType: 'all_projects' },
          { permissionId: 'designs.3d.edit', scopeType: 'all_projects' },
          { permissionId: 'designs.3d.export', scopeType: 'all_projects' },
          { permissionId: 'furniture:browse', scopeType: 'all_projects' },
          { permissionId: 'furniture:custom_param', scopeType: 'all_projects' },
          { permissionId: 'materials:browse', scopeType: 'all_projects' },
          { permissionId: 'materials:manage', scopeType: 'all_projects' },
          { permissionId: 'quotes:view_costs', scopeType: 'all_projects' },
          { permissionId: 'quotes:edit_margins', scopeType: 'all_projects' },
          { permissionId: 'quotes:send', scopeType: 'all_projects' },
          { permissionId: 'production:download_cutlist', scopeType: 'all_projects' },
          { permissionId: 'deliverables:generate', scopeType: 'all_projects' },
          { permissionId: 'deliverables:share', scopeType: 'all_projects' },
          { permissionId: 'clients:view_pii', scopeType: 'all_projects' },
          { permissionId: 'clients:manage', scopeType: 'all_projects' },
        ],
      },
    ],
  };

  const designerActor: ActorContext = {
    id: 'user_designer',
    orgId,
    roles: [
      {
        roleId: 'designer',
        status: 'active',
        permissions: [
          { permissionId: 'projects:read', scopeType: 'all_projects' },
          { permissionId: 'projects:write', scopeType: 'assigned_projects' },
          { permissionId: 'floor_plans:read', scopeType: 'all_projects' },
          { permissionId: 'floor_plans:write', scopeType: 'assigned_projects' },
          { permissionId: 'designs.2d.view', scopeType: 'all_projects' },
          { permissionId: 'designs.3d.view', scopeType: 'all_projects' },
          { permissionId: 'designs.3d.edit', scopeType: 'assigned_projects' },
          { permissionId: 'furniture:browse', scopeType: 'all_projects' },
          { permissionId: 'furniture:custom_param', scopeType: 'assigned_projects' },
          { permissionId: 'materials:browse', scopeType: 'all_projects' },
          { permissionId: 'quotes:send', scopeType: 'assigned_projects' },
          { permissionId: 'deliverables:generate', scopeType: 'assigned_projects' },
          { permissionId: 'deliverables:share', scopeType: 'assigned_projects' },
          { permissionId: 'clients:view_pii', scopeType: 'all_projects' },
        ],
      },
    ],
  };

  const productionActor: ActorContext = {
    id: 'user_production',
    orgId,
    roles: [
      {
        roleId: 'production',
        status: 'active',
        permissions: [
          { permissionId: 'projects:read', scopeType: 'all_projects' },
          { permissionId: 'designs.3d.view', scopeType: 'all_projects' },
          { permissionId: 'production:download_cutlist', scopeType: 'all_projects' },
        ],
      },
    ],
  };

  const viewerActor: ActorContext = {
    id: 'user_viewer',
    orgId,
    roles: [
      {
        roleId: 'viewer',
        status: 'active',
        permissions: [
          { permissionId: 'projects:read', scopeType: 'all_projects' },
          { permissionId: 'designs.2d.view', scopeType: 'all_projects' },
          { permissionId: 'designs.3d.view', scopeType: 'all_projects' },
          { permissionId: 'furniture:browse', scopeType: 'all_projects' },
          { permissionId: 'materials:browse', scopeType: 'all_projects' },
        ],
      },
    ],
  };

  const projectResourceAssigned: ResourceContext = {
    projectId: 'proj_alpha',
    assignedUserIds: ['user_designer'],
  };

  const projectResourceUnassigned: ResourceContext = {
    projectId: 'proj_beta',
    assignedUserIds: ['user_other'],
  };

  it('verifies all expected business modules are registered', () => {
    const modules = moduleRegistry.getRegisteredModules();
    const ids = modules.map((m) => m.id);
    expect(ids).toContain('module-projects');
    expect(ids).toContain('module-floor-plans');
    expect(ids).toContain('module-cad-engine');
    expect(ids).toContain('module-furniture-library');
    expect(ids).toContain('module-materials');
    expect(ids).toContain('module-commercial');
    expect(ids).toContain('module-deliverables');
    expect(ids).toContain('module-client-deliverables');
    expect(ids).toContain('module-governance');
  });

  describe('1. module-projects (Projects & Workspaces)', () => {
    it('ALLOWS owner to delete projects', () => {
      expect(evaluateAuthorization(ownerActor, 'projects:delete').allowed).toBe(true);
    });

    it('DENIES designer and viewer from deleting projects', () => {
      expect(evaluateAuthorization(designerActor, 'projects:delete').allowed).toBe(false);
      expect(evaluateAuthorization(viewerActor, 'projects:delete').allowed).toBe(false);
    });

    it('ALLOWS designer to write only to assigned projects', () => {
      expect(evaluateAuthorization(designerActor, 'projects:write', projectResourceAssigned).allowed).toBe(true);
      expect(evaluateAuthorization(designerActor, 'projects:write', projectResourceUnassigned).allowed).toBe(false);
    });
  });

  describe('2. module-floor-plans (Floor Plans & 2D Drafting)', () => {
    it('ALLOWS designer to edit floor plans in assigned project', () => {
      expect(evaluateAuthorization(designerActor, 'floor_plans:write', projectResourceAssigned).allowed).toBe(true);
    });

    it('DENIES viewer from editing floor plans', () => {
      expect(evaluateAuthorization(viewerActor, 'floor_plans:write').allowed).toBe(false);
    });
  });

  describe('3. module-cad-engine (2D & 3D CAD Modeling)', () => {
    it('ALLOWS owner to export CAD drawings in DXF format', () => {
      expect(evaluateAuthorization(ownerActor, 'designs.3d.export').allowed).toBe(true);
    });

    it('DENIES designer from exporting CAD drawings without explicit grant', () => {
      expect(evaluateAuthorization(designerActor, 'designs.3d.export').allowed).toBe(false);
    });

    it('ALLOWS viewer to view 3D viewport but DENIES 3D editing', () => {
      expect(evaluateAuthorization(viewerActor, 'designs.3d.view').allowed).toBe(true);
      expect(evaluateAuthorization(viewerActor, 'designs.3d.edit').allowed).toBe(false);
    });
  });

  describe('4. module-furniture-library (Parametric Cabinetry)', () => {
    it('ALLOWS designer to override custom parametric cabinetry', () => {
      expect(evaluateAuthorization(designerActor, 'furniture:custom_param', projectResourceAssigned).allowed).toBe(true);
    });

    it('DENIES viewer from modifying parametric cabinetry', () => {
      expect(evaluateAuthorization(viewerActor, 'furniture:custom_param').allowed).toBe(false);
    });
  });

  describe('5. module-materials (Materials & Finishes)', () => {
    it('ALLOWS owner to configure studio materials & rate cards', () => {
      expect(evaluateAuthorization(ownerActor, 'materials:manage').allowed).toBe(true);
    });

    it('DENIES designer from modifying studio material catalog/rate cards', () => {
      expect(evaluateAuthorization(designerActor, 'materials:manage').allowed).toBe(false);
    });
  });

  describe('6. module-commercial (Commercial Estimates & Quotes)', () => {
    it('ALLOWS owner to view internal factory costs and edit profit margins', () => {
      expect(evaluateAuthorization(ownerActor, 'quotes:view_costs').allowed).toBe(true);
      expect(evaluateAuthorization(ownerActor, 'quotes:edit_margins').allowed).toBe(true);
    });

    it('DENIES designer, production, and viewer from viewing factory costs', () => {
      expect(evaluateAuthorization(designerActor, 'quotes:view_costs').allowed).toBe(false);
      expect(evaluateAuthorization(productionActor, 'quotes:view_costs').allowed).toBe(false);
      expect(evaluateAuthorization(viewerActor, 'quotes:view_costs').allowed).toBe(false);
    });

    it('DENIES non-owners from editing profit margins', () => {
      expect(evaluateAuthorization(designerActor, 'quotes:edit_margins').allowed).toBe(false);
      expect(evaluateAuthorization(productionActor, 'quotes:edit_margins').allowed).toBe(false);
    });
  });

  describe('7. module-deliverables (Manufacturing & Cut Lists)', () => {
    it('ALLOWS production and owner to download CNC cut lists', () => {
      expect(evaluateAuthorization(productionActor, 'production:download_cutlist').allowed).toBe(true);
      expect(evaluateAuthorization(ownerActor, 'production:download_cutlist').allowed).toBe(true);
    });

    it('DENIES designer and viewer from downloading production cut lists', () => {
      expect(evaluateAuthorization(designerActor, 'production:download_cutlist').allowed).toBe(false);
      expect(evaluateAuthorization(viewerActor, 'production:download_cutlist').allowed).toBe(false);
    });
  });

  describe('8. module-client-deliverables (Presentations & Lookbooks)', () => {
    it('ALLOWS designer to generate lookbooks on assigned projects', () => {
      expect(evaluateAuthorization(designerActor, 'deliverables:generate', projectResourceAssigned).allowed).toBe(true);
    });

    it('DENIES viewer from generating presentations', () => {
      expect(evaluateAuthorization(viewerActor, 'deliverables:generate').allowed).toBe(false);
    });
  });

  describe('9. module-governance (Studio Governance & DPDP)', () => {
    it('ALLOWS owner to manage org settings and team members', () => {
      expect(evaluateAuthorization(ownerActor, 'org:manage').allowed).toBe(true);
      expect(evaluateAuthorization(ownerActor, 'members:manage').allowed).toBe(true);
    });

    it('DENIES designer and production from managing studio members or org', () => {
      expect(evaluateAuthorization(designerActor, 'org:manage').allowed).toBe(false);
      expect(evaluateAuthorization(productionActor, 'members:manage').allowed).toBe(false);
    });

    it('DENIES production and viewer from viewing client contact PII (DPDP-2023)', () => {
      expect(evaluateAuthorization(productionActor, 'clients:view_pii').allowed).toBe(false);
      expect(evaluateAuthorization(viewerActor, 'clients:view_pii').allowed).toBe(false);
    });
  });
});
