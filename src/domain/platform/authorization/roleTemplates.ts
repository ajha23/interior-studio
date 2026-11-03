import type { RoleTemplate } from './types';

/**
 * Predefined Industry Role Templates.
 * Accelerates tenant onboarding while providing customizable baselines (US1, US4).
 * Framework-free TypeScript complying with Constitution Principle VI.
 */
export const PREDEFINED_ROLE_TEMPLATES: RoleTemplate[] = [
  {
    id: 'tpl-project-manager',
    name: 'Project Manager',
    description: 'Manages project timelines, client interactions, formal quotations, and team coordination.',
    category: 'Management',
    defaultRank: 75,
    recommendedScope: 'all_projects',
    grantedPermissionIds: [
      'projects:read',
      'projects:write',
      'floor_plans:read',
      'designs.2d.view',
      'designs.3d.view',
      'furniture:browse',
      'materials:browse',
      'quotes:view_costs',
      'quotes:edit_margins',
      'quotes:send',
      'deliverables:generate',
      'deliverables:share',
      'clients:view_pii',
      'clients:manage',
    ],
  },
  {
    id: 'tpl-senior-designer',
    name: 'Senior Designer',
    description: 'Comprehensive 2D/3D design authoring, custom parametric cabinetry, rendering, and CAD exports.',
    category: 'Design',
    defaultRank: 65,
    recommendedScope: 'all_projects',
    grantedPermissionIds: [
      'projects:read',
      'projects:write',
      'floor_plans:read',
      'floor_plans:write',
      'designs.2d.view',
      'designs.3d.view',
      'designs.3d.edit',
      'designs.3d.export',
      'furniture:browse',
      'furniture:custom_param',
      'materials:browse',
      'materials:manage',
      'deliverables:generate',
      'deliverables:share',
    ],
  },
  {
    id: 'tpl-designer',
    name: 'Designer',
    description: 'Standard 2D floor planning and 3D interior design editing on assigned customer projects.',
    category: 'Design',
    defaultRank: 50,
    recommendedScope: 'assigned_projects',
    grantedPermissionIds: [
      'projects:read',
      'projects:write',
      'floor_plans:read',
      'floor_plans:write',
      'designs.2d.view',
      'designs.3d.view',
      'designs.3d.edit',
      'furniture:browse',
      'furniture:custom_param',
      'materials:browse',
      'deliverables:generate',
    ],
  },
  {
    id: 'tpl-reviewer',
    name: 'Reviewer',
    description: 'Quality assurance, design verification, client package approval, and presentation sharing.',
    category: 'Operations',
    defaultRank: 40,
    recommendedScope: 'all_projects',
    grantedPermissionIds: [
      'projects:read',
      'floor_plans:read',
      'designs.2d.view',
      'designs.3d.view',
      'materials:browse',
      'deliverables:generate',
      'deliverables:share',
      'quotes:view_costs',
    ],
  },
  {
    id: 'tpl-client-viewer',
    name: 'Client Viewer',
    description: 'Read-only presentation and 3D walkthrough viewing for approved client deliverables.',
    category: 'External',
    defaultRank: 20,
    recommendedScope: 'assigned_projects',
    grantedPermissionIds: [
      'designs.3d.view',
      'deliverables:generate',
    ],
  },
];

/**
 * Retrieve all predefined role templates.
 */
export function getRoleTemplates(): RoleTemplate[] {
  return [...PREDEFINED_ROLE_TEMPLATES];
}

/**
 * Retrieve a single role template by ID.
 */
export function getRoleTemplateById(templateId: string): RoleTemplate | undefined {
  return PREDEFINED_ROLE_TEMPLATES.find((t) => t.id === templateId);
}
