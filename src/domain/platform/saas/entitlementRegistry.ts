/**
 * Pure domain EntitlementRegistry indexing canonical keys for modules, features, and quotas.
 * Conforms to Constitution Principle X (FR-002).
 */

import { CanonicalKeySchema, type CanonicalKey } from './types';

export interface CapabilityDescriptor {
  key: CanonicalKey;
  category: 'module' | 'feature' | 'quota' | 'addon';
  displayName: string;
  description: string;
}

export class EntitlementRegistry {
  private static registeredCapabilities: Map<CanonicalKey, CapabilityDescriptor> = new Map([
    // Modules
    [
      'module.saas.platform',
      {
        key: 'module.saas.platform',
        category: 'module',
        displayName: 'SaaS Platform Core',
        description: 'Multi-tenant subscription, billing, and entitlement evaluation',
      },
    ],
    [
      'module.design',
      {
        key: 'module.design',
        category: 'module',
        displayName: '2D & 3D Interior Design Studio',
        description: 'Floor planning, parametric 3D modeling, and materials',
      },
    ],
    [
      'module.manufacturing',
      {
        key: 'module.manufacturing',
        category: 'module',
        displayName: 'Manufacturing & Production',
        description: 'CNC cut lists, edge banding, and CAM DXF generation',
      },
    ],
    [
      'module.governance',
      {
        key: 'module.governance',
        category: 'module',
        displayName: 'Enterprise Governance & Security',
        description: 'Custom RBAC roles, audit logs, and resource scoping',
      },
    ],

    // Features
    [
      'feature.design.3d.render',
      {
        key: 'feature.design.3d.render',
        category: 'feature',
        displayName: '3D Photorealistic Rendering',
        description: 'High-resolution raymarched and cloud rendering',
      },
    ],
    [
      'feature.design.3d.export_cad',
      {
        key: 'feature.design.3d.export_cad',
        category: 'feature',
        displayName: 'AutoCAD DXF & DWG Export',
        description: 'Export architectural drawings to CAD vectors',
      },
    ],
    [
      'feature.manufacturing.cnc_cutlist',
      {
        key: 'feature.manufacturing.cnc_cutlist',
        category: 'feature',
        displayName: 'CNC Cut List & Panel Optimization',
        description: 'Panel nesting, sheet yield optimization, and CSV export',
      },
    ],
    [
      'feature.commercial.margin_editor',
      {
        key: 'feature.commercial.margin_editor',
        category: 'feature',
        displayName: 'Commercial Margin & Pricing Rules',
        description: 'Custom pricing tiers, contractor markups, and margin controls',
      },
    ],
    [
      'feature.ai.layout_generator',
      {
        key: 'feature.ai.layout_generator',
        category: 'feature',
        displayName: 'AI Kitchen & Wardrobe Layout Generator',
        description: 'Intelligent ergonomic furniture placement and voice copilot',
      },
    ],
    [
      'feature.governance.custom_roles',
      {
        key: 'feature.governance.custom_roles',
        category: 'feature',
        displayName: 'Granular Custom RBAC Roles',
        description: 'Define studio-specific roles with scoped resource permissions',
      },
    ],
    [
      'feature.governance.dedicated_audit',
      {
        key: 'feature.governance.dedicated_audit',
        category: 'feature',
        displayName: 'Statutory Tamper-Evident Audit Export',
        description: 'Cryptographically signed audit logs and DPDP export',
      },
    ],

    // Quotas
    [
      'quota.projects.active.max',
      {
        key: 'quota.projects.active.max',
        category: 'quota',
        displayName: 'Maximum Active Projects',
        description: 'Concurrent editable projects across the studio organization',
      },
    ],
    [
      'quota.seats.designers.max',
      {
        key: 'quota.seats.designers.max',
        category: 'quota',
        displayName: 'Licensed Designer Seats',
        description: 'Number of active designer and editor user accounts',
      },
    ],
    [
      'quota.renderings.monthly.max',
      {
        key: 'quota.renderings.monthly.max',
        category: 'quota',
        displayName: 'Monthly Rendering Credits',
        description: '3D perspective image rendering operations per billing cycle',
      },
    ],
    [
      'quota.ai_operations.monthly.max',
      {
        key: 'quota.ai_operations.monthly.max',
        category: 'quota',
        displayName: 'Monthly AI Operations',
        description: 'AI layout generations and automated design consultations',
      },
    ],

    // Addons
    [
      'addon.seats.designer.bundle_5',
      {
        key: 'addon.seats.designer.bundle_5',
        category: 'addon',
        displayName: 'Extra 5 Designer Seats',
        description: 'Add 5 additional licensed editor seats to any active plan',
      },
    ],
    [
      'addon.projects.active.bundle_25',
      {
        key: 'addon.projects.active.bundle_25',
        category: 'addon',
        displayName: 'Extra 25 Active Projects',
        description: 'Expand active editable project capacity by 25',
      },
    ],
    [
      'addon.renderings.monthly.bundle_100',
      {
        key: 'addon.renderings.monthly.bundle_100',
        category: 'addon',
        displayName: '100 Extra Monthly Renders',
        description: 'Additional compute credits for photorealistic renders',
      },
    ],
  ]);

  /**
   * Validates if a string conforms to the canonical key regex:
   * ^(module|feature|quota|addon)\.[a-z0-9_.-]+$
   */
  public static isValidKey(key: string): boolean {
    const parse = CanonicalKeySchema.safeParse(key);
    return parse.success;
  }

  /**
   * Registers a new capability dynamically into the registry.
   */
  public static registerCapability(desc: CapabilityDescriptor): void {
    CanonicalKeySchema.parse(desc.key);
    this.registeredCapabilities.set(desc.key, desc);
  }

  /**
   * Look up a capability descriptor by canonical key.
   */
  public static getCapability(key: CanonicalKey): CapabilityDescriptor | undefined {
    return this.registeredCapabilities.get(key);
  }

  /**
   * List all registered canonical keys.
   */
  public static listRegisteredKeys(): CanonicalKey[] {
    return Array.from(this.registeredCapabilities.keys());
  }
}
