import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Import all 8 workspace packages via their namespace aliases
import * as Core from '@studio/core';
import * as Platform from '@studio/platform';
import * as Catalog from '@studio/catalog';
import * as Engine from '@studio/engine';
import * as Measure from '@studio/measure';
import * as Commercial from '@studio/commercial';
import * as Deliverables from '@studio/deliverables';
import * as Ai from '@studio/ai';

describe('ARC-01 Monorepo Package Scaffolding & Turborepo Verification', () => {
  it('loads valid pnpm-workspace.yaml and turbo.json configurations', () => {
    const pnpmWorkspace = fs.readFileSync(path.resolve(process.cwd(), 'pnpm-workspace.yaml'), 'utf-8');
    expect(pnpmWorkspace).toContain('packages/*');
    expect(pnpmWorkspace).toContain('apps/*');

    const turboJson = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'turbo.json'), 'utf-8'));
    expect(turboJson.tasks).toBeDefined();
    expect(turboJson.tasks.build).toBeDefined();
    expect(turboJson.tasks.test).toBeDefined();
    expect(turboJson.tasks.typecheck).toBeDefined();
    expect(turboJson.tasks.lint).toBeDefined();
  });

  it('scaffolds all 8 bounded domain packages with valid package.json declarations', () => {
    const packageNames = [
      'core',
      'platform',
      'catalog',
      'engine',
      'measure',
      'commercial',
      'deliverables',
      'ai',
    ];

    for (const pkg of packageNames) {
      const pkgJsonPath = path.resolve(process.cwd(), `packages/${pkg}/package.json`);
      expect(fs.existsSync(pkgJsonPath), `packages/${pkg}/package.json should exist`).toBe(true);

      const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
      expect(pkgJson.name).toBe(`@studio/${pkg}`);
      expect(pkgJson.version).toBe('1.0.0-alpha.1');
      expect(pkgJson.type).toBe('module');
    }
  });

  it('scaffolds apps/web and apps/workers with valid workspace references', () => {
    const apps = ['web', 'workers'];
    for (const app of apps) {
      const appJsonPath = path.resolve(process.cwd(), `apps/${app}/package.json`);
      expect(fs.existsSync(appJsonPath), `apps/${app}/package.json should exist`).toBe(true);

      const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf-8'));
      expect(appJson.name).toBe(`@studio/${app}`);
      expect(appJson.private).toBe(true);
    }
  });

  it('exports authoritative domain APIs across all 8 package namespaces', () => {
    // 1. Core
    expect(Core.KitchenProjectSchema).toBeDefined();
    expect(Core.evaluateLifecycleInvalidation).toBeDefined();

    // 2. Platform
    expect(Platform.hasPermission).toBeDefined();
    expect(Platform.ROLE_PERMISSIONS).toBeDefined();

    // 3. Catalog
    expect(Catalog.STANDARD_MODULES).toBeDefined();
    expect(Catalog.FACTORY_VALIDATED_RULE_PACK_V1).toBeDefined();

    // 4. Engine
    expect(Engine.explodeScene).toBeDefined();
    expect(Engine.computeCanonicalSha256).toBeDefined();

    // 5. Measure
    expect(Measure.evaluateRoomClosure).toBeDefined();
    expect(Measure.MAX_CLOSURE_TOLERANCE_MM).toBe(10);

    // 6. Commercial
    expect(Commercial.calculateQuotation).toBeDefined();
    expect(Commercial.DEFAULT_RATE_CARD_V1).toBeDefined();

    // 7. Deliverables
    expect(Deliverables.exportPlanDxf).toBeDefined();
    expect(Deliverables.buildModuleShopDrawing).toBeDefined();

    // 8. AI
    expect(Ai.suggestModuleSequence).toBeDefined();
  });
});
