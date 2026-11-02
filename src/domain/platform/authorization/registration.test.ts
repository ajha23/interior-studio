import { describe, it, expect, beforeEach } from 'vitest';
import { moduleRegistry } from './moduleRegistry';
import { bootstrapModuleRegistry } from './bootstrap';

describe('User Story 1 - Central Module & Capability Registration (FR-001, FR-002)', () => {
  beforeEach(() => {
    moduleRegistry.resetForTesting();
  });

  it('successfully bootstraps all baseline studio modules with no circular dependencies', () => {
    bootstrapModuleRegistry();

    const modules = moduleRegistry.getRegisteredModules();
    expect(modules.length).toBeGreaterThanOrEqual(5);

    const moduleIds = modules.map((m) => m.id);
    expect(moduleIds).toContain('module-projects');
    expect(moduleIds).toContain('module-cad-engine');
    expect(moduleIds).toContain('module-commercial');
    expect(moduleIds).toContain('module-deliverables');
    expect(moduleIds).toContain('module-governance');

    // Projects must precede CAD engine, which must precede Deliverables
    const projectsIndex = moduleIds.indexOf('module-projects');
    const cadIndex = moduleIds.indexOf('module-cad-engine');
    const deliverablesIndex = moduleIds.indexOf('module-deliverables');

    expect(projectsIndex).toBeLessThan(cadIndex);
    expect(cadIndex).toBeLessThan(deliverablesIndex);
  });

  it('indexes all granular action permissions across modules', () => {
    bootstrapModuleRegistry();

    const allPermissions = moduleRegistry.getAllPermissions();
    expect(allPermissions.length).toBeGreaterThanOrEqual(10);

    const permIds = allPermissions.map((p) => p.id);
    expect(permIds).toContain('projects:read');
    expect(permIds).toContain('designs.3d.edit');
    expect(permIds).toContain('quotes:view_costs');
    expect(permIds).toContain('production:download_cutlist');
    expect(permIds).toContain('clients:view_pii');
  });

  it('validates registry graph integrity cleanly', () => {
    bootstrapModuleRegistry();

    const integrity = moduleRegistry.validateRegistryIntegrity();
    expect(integrity.valid).toBe(true);
    expect(integrity.errors).toHaveLength(0);
  });
});
