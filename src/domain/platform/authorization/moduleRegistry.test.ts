import { describe, it, expect, beforeEach } from 'vitest';
import { ModuleRegistry } from './moduleRegistry';

describe('ModuleRegistry (FR-001, FR-002, Constitution Principle VI)', () => {
  let registry: ModuleRegistry;

  beforeEach(() => {
    registry = new ModuleRegistry();
  });

  it('registers a module and exposes its definition', () => {
    registry.registerModule({
      id: 'module-core',
      name: 'Core System',
      version: '1.0.0',
      description: 'Foundational models and math',
      dependencies: [],
      capabilities: [
        {
          key: 'core.settings',
          title: 'System Settings',
          description: 'Basic studio preferences',
          defaultScopes: ['all_projects'],
        },
      ],
    });

    const mod = registry.getModule('module-core');
    expect(mod).toBeDefined();
    expect(mod?.name).toBe('Core System');
  });

  it('prevents duplicate module registrations', () => {
    registry.registerModule({
      id: 'module-projects',
      name: 'Projects',
      version: '1.0.0',
      description: 'Projects module',
      dependencies: [],
      capabilities: [],
    });

    expect(() => {
      registry.registerModule({
        id: 'module-projects',
        name: 'Projects Duplicate',
        version: '1.0.0',
        description: 'Duplicate',
        dependencies: [],
        capabilities: [],
      });
    }).toThrowError(/already registered/);
  });

  it('registers granular permissions for an existing module', () => {
    registry.registerModule({
      id: 'module-3d',
      name: '3D Editor',
      version: '1.0.0',
      description: '3D viewport',
      dependencies: [],
      capabilities: [],
    });

    registry.registerPermissions('module-3d', [
      {
        id: 'designs.3d.view',
        moduleId: 'module-3d',
        resource: 'designs',
        action: 'view',
        title: 'View 3D',
        description: 'View 3D viewport',
        supportedScopes: ['all_projects', 'assigned_projects'],
      },
      {
        id: 'designs.3d.export',
        moduleId: 'module-3d',
        resource: 'designs',
        action: 'export',
        title: 'Export 3D',
        description: 'Export 3D model',
        supportedScopes: ['all_projects'],
      },
    ]);

    const perms = registry.getPermissionsForModule('module-3d');
    expect(perms).toHaveLength(2);
    expect(perms[0]?.id).toBe('designs.3d.view');
  });

  it('rejects registering permissions for an unregistered module', () => {
    expect(() => {
      registry.registerPermissions('unregistered-mod', [
        {
          id: 'test.action',
          moduleId: 'unregistered-mod',
          resource: 'test',
          action: 'action',
          title: 'Test',
          description: 'Test action',
          supportedScopes: ['all_projects'],
        },
      ]);
    }).toThrowError(/unregistered module/);
  });

  it('returns registered modules in topological dependency order', () => {
    registry.registerModule({
      id: 'module-deliverables',
      name: 'Deliverables',
      version: '1.0.0',
      description: 'Drawings & sheets',
      dependencies: ['module-engine'],
      capabilities: [],
    });

    registry.registerModule({
      id: 'module-core',
      name: 'Core',
      version: '1.0.0',
      description: 'Core schemas',
      dependencies: [],
      capabilities: [],
    });

    registry.registerModule({
      id: 'module-engine',
      name: 'Engine',
      version: '1.0.0',
      description: 'Math engine',
      dependencies: ['module-core'],
      capabilities: [],
    });

    const ordered = registry.getRegisteredModules();
    expect(ordered.map((m) => m.id)).toEqual([
      'module-core',
      'module-engine',
      'module-deliverables',
    ]);
  });

  it('detects and rejects circular dependencies via Kahn algorithm', () => {
    registry.registerModule({
      id: 'module-a',
      name: 'Module A',
      version: '1.0.0',
      description: 'A depends on B',
      dependencies: ['module-b'],
      capabilities: [],
    });

    registry.registerModule({
      id: 'module-b',
      name: 'Module B',
      version: '1.0.0',
      description: 'B depends on A',
      dependencies: ['module-a'],
      capabilities: [],
    });

    expect(() => registry.getRegisteredModules()).toThrowError(
      /Circular dependency detected/
    );
  });
});
