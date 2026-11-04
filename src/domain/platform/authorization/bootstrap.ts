import { moduleRegistry } from './moduleRegistry';

/**
 * Bootstraps and registers all baseline Interior Studio business modules and permissions
 * with the Central Module Registry (FR-001, FR-002, US1).
 * Idempotent: safe to call repeatedly.
 */
export function bootstrapModuleRegistry(): void {
  if (moduleRegistry.getRegisteredModules().length > 0) {
    return;
  }

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
      action: 'view',
      title: 'View Projects',
      description: 'View project metadata, layout, and room specifications',
      supportedScopes: ['all_projects', 'assigned_projects', 'client_projects'],
    },
    {
      id: 'projects:write',
      moduleId: 'module-projects',
      resource: 'projects',
      action: 'edit',
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
      isHighRisk: true,
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
      action: 'view',
      title: 'View Floor Plans',
      description: 'View 2D architectural drawings',
      supportedScopes: ['all_projects', 'assigned_projects'],
    },
    {
      id: 'floor_plans:write',
      moduleId: 'module-floor-plans',
      resource: 'floor_plans',
      action: 'edit',
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
      action: 'view',
      title: 'View 2D Plans',
      description: 'View 2D floor plans and elevation views',
      supportedScopes: ['all_projects', 'assigned_projects'],
    },
    {
      id: 'designs.3d.view',
      moduleId: 'module-cad-engine',
      resource: 'designs',
      action: 'view',
      title: 'View 3D Viewport',
      description: 'Orbit and inspect 3D scenes',
      supportedScopes: ['all_projects', 'assigned_projects', 'client_projects'],
    },
    {
      id: 'designs.3d.edit',
      moduleId: 'module-cad-engine',
      resource: 'designs',
      action: 'edit',
      title: 'Edit 3D Layout',
      description: 'Place and resize cabinetry in 3D',
      supportedScopes: ['all_projects', 'assigned_projects'],
    },
    {
      id: 'designs.3d.export',
      moduleId: 'module-cad-engine',
      resource: 'designs',
      action: 'export',
      title: 'Export AutoCAD DXF',
      description: 'Export CAD drawings in DXF format',
      entitlementKey: 'feature.design.3d.export_cad',
      supportedScopes: ['all_projects'],
    },
    {
      id: 'designs.3d.render',
      moduleId: 'module-cad-engine',
      resource: 'designs',
      action: 'create',
      title: 'Photorealistic 3D Rendering',
      description: 'Raymarched high-resolution perspective rendering',
      entitlementKey: 'feature.design.3d.render',
      supportedScopes: ['all_projects', 'assigned_projects'],
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
      action: 'view',
      title: 'Browse Furniture Catalog',
      description: 'View standard cabinetry and appliance models',
      supportedScopes: ['all_projects', 'assigned_projects'],
    },
    {
      id: 'furniture:custom_param',
      moduleId: 'module-furniture-library',
      resource: 'furniture',
      action: 'edit',
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
      action: 'view',
      title: 'Browse Materials Catalog',
      description: 'Inspect material swatches, grain patterns, and finishes',
      supportedScopes: ['all_projects', 'assigned_projects'],
    },
    {
      id: 'materials:manage',
      moduleId: 'module-materials',
      resource: 'materials',
      action: 'edit',
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
      action: 'view',
      title: 'View Factory Production Costs',
      description: 'Inspect internal material/hardware costs and cost-down suggestions',
      supportedScopes: ['all_projects'],
    },
    {
      id: 'quotes:edit_margins',
      moduleId: 'module-commercial',
      resource: 'quotes',
      action: 'edit',
      title: 'Edit Profit Margins',
      description: 'Modify markups and discount rates',
      entitlementKey: 'feature.commercial.margin_editor',
      isHighRisk: true,
      supportedScopes: ['all_projects'],
    },
    {
      id: 'quotes:send',
      moduleId: 'module-commercial',
      resource: 'quotes',
      action: 'export',
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
      action: 'export',
      title: 'Download Cut Lists',
      description: 'Download OptiCut/Cut Rite CSV cut lists and CNC packages',
      entitlementKey: 'feature.manufacturing.cnc_cutlist',
      supportedScopes: ['all_projects'],
    },
    {
      id: 'production:sheet_nesting',
      moduleId: 'module-deliverables',
      resource: 'production',
      action: 'create',
      title: '2D Sheet Nesting & Optimization',
      description: 'Guillotine cutting optimization, sheet yield, and visual cutting patterns',
      entitlementKey: 'feature.manufacturing.sheet_nesting',
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
      action: 'create',
      title: 'Generate Presentations',
      description: 'Render high-resolution perspective images and lookbooks',
      supportedScopes: ['all_projects', 'assigned_projects'],
    },
    {
      id: 'deliverables:share',
      moduleId: 'module-client-deliverables',
      resource: 'deliverables',
      action: 'export',
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
      action: 'edit',
      title: 'Manage Organization',
      description: 'Full administrative settings, billing, and subscription management',
      isHighRisk: true,
      supportedScopes: ['all_projects'],
    },
    {
      id: 'members:manage',
      moduleId: 'module-governance',
      resource: 'members',
      action: 'edit',
      title: 'Manage Team Members',
      description: 'Invite members and configure role assignments',
      isHighRisk: true,
      supportedScopes: ['all_projects'],
    },
    {
      id: 'clients:view_pii',
      moduleId: 'module-governance',
      resource: 'clients',
      action: 'view',
      title: 'View Client Contact PII',
      description: 'View unmasked client phone, email, and site address',
      isHighRisk: true,
      supportedScopes: ['all_projects', 'assigned_projects'],
    },
    {
      id: 'clients:manage',
      moduleId: 'module-governance',
      resource: 'clients',
      action: 'edit',
      title: 'Manage Client Profiles',
      description: 'Create and update client records and DPDP consents',
      supportedScopes: ['all_projects'],
    },
  ]);

  // 10. AI Design Assistance
  moduleRegistry.registerModule({
    id: 'module-ai-assistance',
    name: 'AI Design Assistance',
    version: '1.0.0',
    description: 'Automated space planning, conversational assistant, and material recommendations',
    dependencies: ['module-projects', 'module-cad-engine'],
    capabilities: [
      {
        key: 'ai.copilot',
        title: 'AI Design Copilot',
        description: 'AI-assisted floor plan generation and styling',
        defaultScopes: ['all_projects', 'assigned_projects'],
      },
    ],
  });

  moduleRegistry.registerPermissions('module-ai-assistance', [
    {
      id: 'ai:layout_suggest',
      moduleId: 'module-ai-assistance',
      resource: 'ai',
      action: 'create',
      title: 'AI Layout Suggestions',
      description: 'Generate automated room layout and cabinet configurations',
      entitlementKey: 'feature.ai.layout_agent',
      supportedScopes: ['all_projects', 'assigned_projects'],
    },
  ]);
}
