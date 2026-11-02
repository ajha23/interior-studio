/**
 * Pure domain SubscriptionCatalog managing versioned commercial plans.
 * Conforms to Constitution Principle X (FR-001) and Principle III (Integer Paise).
 */

import { SubscriptionPlanSchema, type SubscriptionPlan } from './types';

export interface ISubscriptionCatalog {
  registerPlan(plan: SubscriptionPlan): void;
  getPlan(planId: string, version?: number): SubscriptionPlan | undefined;
  listPublicPlans(): SubscriptionPlan[];
}

export class SubscriptionCatalog implements ISubscriptionCatalog {
  private plans: Map<string, SubscriptionPlan> = new Map();
  private latestVersions: Map<string, number> = new Map();

  constructor() {
    this.seedDefaultPlans();
  }

  /**
   * Registers or updates a commercial plan version in the catalog.
   */
  public registerPlan(plan: SubscriptionPlan): void {
    const validated = SubscriptionPlanSchema.parse(plan);
    const key = `${validated.id}:v${validated.version}`;
    this.plans.set(key, validated);

    const currentLatest = this.latestVersions.get(validated.id) ?? 0;
    if (validated.version >= currentLatest) {
      this.latestVersions.set(validated.id, validated.version);
    }
  }

  /**
   * Retrieves a specific version of a plan, or the latest version if omitted.
   */
  public getPlan(planId: string, version?: number): SubscriptionPlan | undefined {
    const targetVersion = version ?? this.latestVersions.get(planId);
    if (!targetVersion) {
      return undefined;
    }
    return this.plans.get(`${planId}:v${targetVersion}`);
  }

  /**
   * Lists all public, active commercial plans (latest versions).
   */
  public listPublicPlans(): SubscriptionPlan[] {
    const publicPlans: SubscriptionPlan[] = [];
    for (const [planId, latestVer] of this.latestVersions.entries()) {
      const plan = this.plans.get(`${planId}:v${latestVer}`);
      if (plan && plan.isPublic) {
        publicPlans.push(plan);
      }
    }
    return publicPlans.sort((a, b) => a.priceMonthlyPaise - b.priceMonthlyPaise);
  }

  /**
   * Seeds default commercial tiers: Trial, Starter, Pro, Enterprise, and In-House.
   */
  private seedDefaultPlans(): void {
    const now = '2026-11-01T00:00:00.000Z';

    const defaultPlans: SubscriptionPlan[] = [
      {
        id: 'trial',
        name: '14-Day Free Trial',
        version: 1,
        tagline: 'Experience the full power of interior 3D modeling',
        priceMonthlyPaise: 0,
        priceAnnualPaise: 0,
        isPublic: false,
        features: {
          'feature.design.3d.render': true,
          'feature.design.3d.export_cad': false,
          'feature.manufacturing.cnc_cutlist': false,
          'feature.manufacturing.sheet_nesting': false,
          'feature.commercial.margin_editor': false,
          'feature.ai.layout_generator': true,
          'feature.governance.custom_roles': false,
          'feature.governance.dedicated_audit': false,
        },
        quotas: {
          'quota.projects.active.max': 5,
          'quota.seats.designers.max': 1,
          'quota.renderings.monthly.max': 20,
          'quota.ai_operations.monthly.max': 10,
          'quota.nesting_runs.monthly.max': 0,
        },
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'starter',
        name: 'Starter Studio',
        version: 1,
        tagline: 'For boutique studios and independent interior designers',
        priceMonthlyPaise: 499900, // ₹4,999/mo
        priceAnnualPaise: 4799000, // ₹47,990/yr
        isPublic: true,
        features: {
          'feature.design.3d.render': true,
          'feature.design.3d.export_cad': false,
          'feature.manufacturing.cnc_cutlist': true,
          'feature.manufacturing.sheet_nesting': false,
          'feature.commercial.margin_editor': false,
          'feature.ai.layout_generator': true,
          'feature.governance.custom_roles': false,
          'feature.governance.dedicated_audit': false,
        },
        quotas: {
          'quota.projects.active.max': 15,
          'quota.seats.designers.max': 2,
          'quota.renderings.monthly.max': 50,
          'quota.ai_operations.monthly.max': 50,
          'quota.nesting_runs.monthly.max': 0,
        },
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'pro',
        name: 'Pro Studio',
        version: 1,
        tagline: 'For growing design teams and turnkey contractor studios',
        priceMonthlyPaise: 1299900, // ₹12,999/mo
        priceAnnualPaise: 12479000, // ₹124,790/yr
        isPublic: true,
        features: {
          'feature.design.3d.render': true,
          'feature.design.3d.export_cad': true,
          'feature.manufacturing.cnc_cutlist': true,
          'feature.manufacturing.sheet_nesting': true,
          'feature.commercial.margin_editor': true,
          'feature.ai.layout_generator': true,
          'feature.governance.custom_roles': true,
          'feature.governance.dedicated_audit': false,
        },
        quotas: {
          'quota.projects.active.max': -1, // Unlimited
          'quota.seats.designers.max': 5,
          'quota.renderings.monthly.max': 200,
          'quota.ai_operations.monthly.max': 200,
          'quota.nesting_runs.monthly.max': 100,
        },
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'enterprise',
        name: 'Enterprise Studio',
        version: 1,
        tagline: 'For multi-location studios with custom governance & high volume',
        priceMonthlyPaise: 3999900, // ₹39,999/mo
        priceAnnualPaise: 38399000, // ₹383,990/yr
        isPublic: true,
        features: {
          'feature.design.3d.render': true,
          'feature.design.3d.export_cad': true,
          'feature.manufacturing.cnc_cutlist': true,
          'feature.manufacturing.sheet_nesting': true,
          'feature.commercial.margin_editor': true,
          'feature.ai.layout_generator': true,
          'feature.governance.custom_roles': true,
          'feature.governance.dedicated_audit': true,
        },
        quotas: {
          'quota.projects.active.max': -1, // Unlimited
          'quota.seats.designers.max': 25,
          'quota.renderings.monthly.max': 1000,
          'quota.ai_operations.monthly.max': 1000,
          'quota.nesting_runs.monthly.max': 1000,
        },
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'inhouse',
        name: 'In-House Studio',
        version: 1,
        tagline: 'Unrestricted development and engineering environment',
        priceMonthlyPaise: 0,
        priceAnnualPaise: 0,
        isPublic: false,
        features: {
          'feature.design.3d.render': true,
          'feature.design.3d.export_cad': true,
          'feature.manufacturing.cnc_cutlist': true,
          'feature.manufacturing.sheet_nesting': true,
          'feature.commercial.margin_editor': true,
          'feature.ai.layout_generator': true,
          'feature.governance.custom_roles': true,
          'feature.governance.dedicated_audit': true,
        },
        quotas: {
          'quota.projects.active.max': -1,
          'quota.seats.designers.max': -1,
          'quota.renderings.monthly.max': -1,
          'quota.ai_operations.monthly.max': -1,
          'quota.nesting_runs.monthly.max': -1,
        },
        createdAt: now,
        updatedAt: now,
      },
    ];

    for (const plan of defaultPlans) {
      this.registerPlan(plan);
    }
  }
}

export const defaultSubscriptionCatalog = new SubscriptionCatalog();
