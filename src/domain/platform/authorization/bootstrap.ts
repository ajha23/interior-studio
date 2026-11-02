import { moduleRegistry } from './moduleRegistry';

/**
 * Bootstraps and registers all baseline Interior Studio business modules and permissions
 * with the Central Module Registry (FR-001, FR-002, US1).
 */
export function bootstrapModuleRegistry(): void {
  // 1. Projects & Workspaces
  moduleRegistry.registerModule({
    id: 'module-projects',
    name: 'Projects & Workspaces',
    version: '1.0.0',
    description: 'Project lifecycle, room dimensions, and team assignments',
    dependencies: [],
    capabilities: [
      {
        key: 'projects.core',
        title: 'Project Management',
        description: 'Create and configure interior projects',
        defaultScopes: ['all_projects', 'assigned_projects'],
      },
    ],
  });

  moduleRegistry.registerPermissions('module-projects', [
    {
      id: 'projects:read',
      moduleId: 'module-projects',
      resource: 'projects',
      action: 'read',
      title: 'View Projects',
      description: 'View project metadata, layout, and room specifications',
      supportedScopes: ['all_projects', 'assigned_projects', 'client_projects'],
    },
    {
      id: 'projects:write',
      moduleId: 'module-projects',
      resource: 'projects',
      action: 'write',
      title: 'Edit Projects',
      description: 'Modify room geometry, layouts, and units',
      supportedScopes: ['all_projects', 'assigned_projects'],
    },
    {
      id: 'projects:delete',
      moduleId: 'module-projects',
      resource: 'projects',
      action: 'delete',
      title: 'Delete Projects',
      description: 'Permanently remove or archive projects',
      supportedScopes: ['all_projects'],
    },
  ]);

  // 2. Floor Plans & 2D Drafting
  moduleRegistry.registerModule({
    id: 'module-floor-plans',
    name: 'Floor Plans & 2D Drafting',
    version: '1.0.0',
    description: 'Wall geometry, architectural dimensions, openings, and 2D floor plans',
    dependencies: ['module-projects'],
    capabilities: [
      {
        key: 'floor_plans.drafting',
        title: 'Floor Plan Drafting',
        description: 'Draft and edit 2D architectural layouts',
        defaultScopes: ['all_projects', 'assigned_projects'],
      },
    ],
  });

  moduleRegistry.registerPermissions('module-floor-plans', [
    {
      id: 'floor_plans:read',
      moduleId: 'module-floor-plans',
      resource: 'floor_plans',
      action: 'read',
      title: 'View Floor Plans',
      description: 'View 2D architectural drawings',
      supportedScopes: ['all_projects', 'assigned_projects'],
    },
    {
      id: 'floor_plans:write',
      moduleId: 'module-floor-plans',
      resource: 'floor_plans',
      action: 'write',
      title: 'Edit Floor Plans',
      description: 'Add walls, doors, and window openings',
      supportedScopes: ['all_projects', 'assigned_projects'],
    },
  ]);

  // 3. 2D & 3D CAD Modeling Engine
  moduleRegistry.registerModule({
    id: 'module-cad-engine',
    name: '2D & 3D CAD Engine',
    version: '1.0.0',
    description: 'Interactive WebGL 3D design, cabinet snapping, and 2D floor plans',
    dependencies: ['module-projects'],
    capabilities: [
      {
        key: 'designs.modeling',
        title: 'CAD Modeling',
        description: 'Edit 2D plans and 3D cabinets',
        defaultScopes: ['all_projects', 'assigned_projects'],
      },
    ],
  });

  moduleRegistry.registerPermissions('module-cad-engine', [
    {
      id: 'designs.2d.view',
      moduleId: 'module-cad-engine',
      resource: 'designs',
      action: 'view_2d',
      title: 'View 2D Plans',
      description: 'View 2D floor plans and elevation views',
      supportedScopes: ['all_projects', 'assigned_projects'],
    },
    {
      id: 'designs.3d.view',
      moduleId: 'module-cad-engine',
      resource: 'designs',
      action: 'view_3d',
      title: 'View 3D Viewport',
      description: 'Orbit and inspect 3D scenes',
      supportedScopes: ['all_projects', 'assigned_projects', 'client_projects'],
    },
    {
      id: 'designs.3d.edit',
      moduleId: 'module-cad-engine',
      resource: 'designs',
      action: 'edit_3d',
      title: 'Edit 3D Layout',
      description: 'Place and resize cabinetry in 3D',
      supportedScopes: ['all_projects', 'assigned_projects'],
    },
    {
      id: 'designs.3d.export',
      moduleId: 'module-cad-engine',
      resource: 'designs',
      action: 'export_cad',
      title: 'Export AutoCAD DXF',
      description: 'Export CAD drawings in DXF format',
      supportedScopes: ['all_projects'],
    },
  ]);

  // 4. Furniture Library & Parametric Components
  moduleRegistry.registerModule({
    id: 'module-furniture-library',
    name: 'Furniture Library',
    version: '1.0.0',
    description: 'Parametric kitchen cabinetry, wardrobes, carcasses, and hardware catalog',
    dependencies: ['module-cad-engine'],
    capabilities: [
      {
        key: 'furniture.catalog',
        title: 'Furniture Catalog',
        description: 'Browse standard and custom furniture templates',
        defaultScopes: ['all_projects', 'assigned_projects'],
      },
    ],
  });

  moduleRegistry.registerPermissions('module-furniture-library', [
    {
      id: 'furniture:browse',
      moduleId: 'module-furniture-library',
      resource: 'furniture',
      action: 'browse',
      title: 'Browse Furniture Catalog',
      description: 'View standard cabinetry and appliance models',
      supportedScopes: ['all_projects', 'assigned_projects'],
    },
    {
      id: 'furniture:custom_param',
      moduleId: 'module-furniture-library',
      resource: 'furniture',
      action: 'custom_param',
      title: 'Custom Parametric Overrides',
      description: 'Modify internal shelves, partitions, and hardware drillings',
      supportedScopes: ['all_projects', 'assigned_projects'],
    },
  ]);

  // 5. Materials & Finishes
  moduleRegistry.registerModule({
    id: 'module-materials',
    name: 'Materials & Finishes',
    version: '1.0.0',
    description: 'Laminates, edge-bands, core substrates, and hardware materials',
    dependencies: ['module-projects'],
    capabilities: [
      {
        key: 'materials.management',
        title: 'Material Management',
        description: 'Assign finishes, core boards, and edge bandings',
        defaultScopes: ['all_projects', 'assigned_projects'],
      },
    ],
  });

  moduleRegistry.registerPermissions('module-materials', [
    {
      id: 'materials:browse',
      moduleId: 'module-materials',
      resource: 'materials',
      action: 'browse',
      title: 'Browse Materials Catalog',
      description: 'Inspect material swatches, grain patterns, and finishes',
      supportedScopes: ['all_projects', 'assigned_projects'],
    },
    {
      id: 'materials:manage',
      moduleId: 'module-materials',
      resource: 'materials',
      action: 'manage',
      title: 'Configure Studio Materials',
      description: 'Upload custom textures, define rate cards, and board sheet sizes',
      supportedScopes: ['all_projects'],
    },
  ]);

  // 6. Commercial Estimates & Accounting
  moduleRegistry.registerModule({
    id: 'module-commercial',
    name: 'Commercial Estimates & Quotes',
    version: '1.0.0',
    description: 'Indian GST calculations, price rate cards, margins, and quotes',
    dependencies: ['module-projects', 'module-cad-engine'],
    capabilities: [
      {
        key: 'estimates.pricing',
        title: 'Commercial Estimator',
        description: 'Generate quotes and manage profit margins',
        defaultScopes: ['all_projects'],
      },
    ],
  });

  moduleRegistry.registerPermissions('module-commercial', [
    {
      id: 'quotes:view_costs',
      moduleId: 'module-commercial',
      resource: 'quotes',
      action: 'view_costs',
      title: 'View Factory Production Costs',
      description: 'Inspect internal material/hardware costs and cost-down suggestions',
      supportedScopes: ['all_projects'],
    },
    {
      id: 'quotes:edit_margins',
      moduleId: 'module-commercial',
      resource: 'quotes',
      action: 'edit_margins',
      title: 'Edit Profit Margins',
      description: 'Modify markups and discount rates',
      supportedScopes: ['all_projects'],
    },
    {
      id: 'quotes:send',
      moduleId: 'module-commercial',
      resource: 'quotes',
      action: 'send',
      title: 'Generate & Send Quotes',
      description: 'Publish formal quotations to clients',
      supportedScopes: ['all_projects', 'assigned_projects'],
    },
  ]);

  // 7. Manufacturing Deliverables & Cut Lists
  moduleRegistry.registerModule({
    id: 'module-deliverables',
    name: 'Manufacturing & Workshop Deliverables',
    version: '1.0.0',
    description: 'OptiCut CSV exports, thermal part labels, and workshop shop drawings',
    dependencies: ['module-projects', 'module-cad-engine'],
    capabilities: [
      {
        key: 'production.manufacturing',
        title: 'Production Packages',
        description: 'Generate cut lists, labels, and shop drawings',
        defaultScopes: ['all_projects'],
      },
    ],
  });

  moduleRegistry.registerPermissions('module-deliverables', [
    {
      id: 'production:download_cutlist',
      moduleId: 'module-deliverables',
      resource: 'production',
      action: 'download_cutlist',
      title: 'Download Cut Lists',
      description: 'Download OptiCut/Cut Rite CSV cut lists and CNC packages',
      supportedScopes: ['all_projects'],
    },
  ]);

  // 8. Client Deliverables & Presentations
  moduleRegistry.registerModule({
    id: 'module-client-deliverables',
    name: 'Client Presentations & Deliverables',
    version: '1.0.0',
    description: 'Client design lookbooks, 3D walkthroughs, and presentation share links',
    dependencies: ['module-projects', 'module-cad-engine'],
    capabilities: [
      {
        key: 'deliverables.presentation',
        title: 'Client Presentations',
        description: 'Generate client presentation lookbooks and walkthroughs',
        defaultScopes: ['all_projects', 'assigned_projects'],
      },
    ],
  });

  moduleRegistry.registerPermissions('module-client-deliverables', [
    {
      id: 'deliverables:generate',
      moduleId: 'module-client-deliverables',
      resource: 'deliverables',
      action: 'generate',
      title: 'Generate Presentations',
      description: 'Render high-resolution perspective images and lookbooks',
      supportedScopes: ['all_projects', 'assigned_projects'],
    },
    {
      id: 'deliverables:share',
      moduleId: 'module-client-deliverables',
      resource: 'deliverables',
      action: 'share',
      title: 'Share Client Links',
      description: 'Generate secure client review links with DPDP expiration',
      supportedScopes: ['all_projects', 'assigned_projects'],
    },
  ]);

  // 9. Studio Governance & DPDP Client Data
  moduleRegistry.registerModule({
    id: 'module-governance',
    name: 'Studio Governance & Client Privacy',
    version: '1.0.0',
    description: 'Role management, organization administration, and DPDP privacy',
    dependencies: [],
    capabilities: [
      {
        key: 'governance.admin',
        title: 'Organization Governance',
        description: 'Manage roles, permissions, team members, and client PII',
        defaultScopes: ['all_projects'],
      },
    ],
  });

  moduleRegistry.registerPermissions('module-governance', [
    {
      id: 'org:manage',
      moduleId: 'module-governance',
      resource: 'org',
      action: 'manage',
      title: 'Manage Organization',
      description: 'Full administrative settings, billing, and subscription management',
      supportedScopes: ['all_projects'],
    },
    {
      id: 'members:manage',
      moduleId: 'module-governance',
      resource: 'members',
      action: 'manage',
      title: 'Manage Team Members',
      description: 'Invite members and configure role assignments',
      supportedScopes: ['all_projects'],
    },
    {
      id: 'clients:view_pii',
      moduleId: 'module-governance',
      resource: 'clients',
      action: 'view_pii',
      title: 'View Client Contact PII',
      description: 'View unmasked client phone, email, and site address',
      supportedScopes: ['all_projects', 'assigned_projects'],
    },
    {
      id: 'clients:manage',
      moduleId: 'module-governance',
      resource: 'clients',
      action: 'manage',
      title: 'Manage Client Profiles',
      description: 'Create and update client records and DPDP consents',
      supportedScopes: ['all_projects'],
    },
  ]);
}
