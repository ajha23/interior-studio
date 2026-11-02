import {
  type ModuleDefinition,
  ModuleDefinitionSchema,
  type PermissionDefinition,
  PermissionDefinitionSchema,
} from './types';

/**
 * In-memory Central Module & Capability Registry.
 * Pure framework-free TypeScript singleton adhering to Constitution Principle VI.
 */
export class ModuleRegistry {
  private modules = new Map<string, ModuleDefinition>();
  private permissions = new Map<string, PermissionDefinition[]>();

  /**
   * Registers a business module and validates its schema and dependencies.
   */
  public registerModule(definition: ModuleDefinition): void {
    const validated = ModuleDefinitionSchema.parse(definition);
    if (this.modules.has(validated.id)) {
      throw new Error(`Module "${validated.id}" is already registered.`);
    }
    this.modules.set(validated.id, validated);
  }

  /**
   * Registers granular permissions declared by a specific module.
   */
  public registerPermissions(
    moduleId: string,
    permissions: PermissionDefinition[]
  ): void {
    if (!this.modules.has(moduleId)) {
      throw new Error(
        `Cannot register permissions for unregistered module "${moduleId}". Register the module first.`
      );
    }

    const validatedList = permissions.map((p) => {
      const parsed = PermissionDefinitionSchema.parse(p);
      if (parsed.moduleId !== moduleId) {
        throw new Error(
          `Permission "${parsed.id}" declares moduleId "${parsed.moduleId}", which does not match target module "${moduleId}".`
        );
      }
      return parsed;
    });

    const existing = this.permissions.get(moduleId) || [];
    const existingIds = new Set(existing.map((p) => p.id));

    for (const p of validatedList) {
      if (existingIds.has(p.id)) {
        throw new Error(`Permission "${p.id}" is already registered.`);
      }
      existingIds.add(p.id);
      existing.push(p);
    }

    this.permissions.set(moduleId, existing);
  }

  /**
   * Retrieves a registered module by its unique identifier.
   */
  public getModule(moduleId: string): ModuleDefinition | undefined {
    return this.modules.get(moduleId);
  }

  /**
   * Retrieves all registered modules in topological dependency order.
   * Uses Kahn's algorithm; throws an error if a circular dependency is detected.
   */
  public getRegisteredModules(): ModuleDefinition[] {
    const inDegree = new Map<string, number>();
    const adj = new Map<string, string[]>();

    for (const id of this.modules.keys()) {
      inDegree.set(id, 0);
      adj.set(id, []);
    }

    for (const [id, mod] of this.modules.entries()) {
      for (const dep of mod.dependencies) {
        if (this.modules.has(dep)) {
          adj.get(dep)!.push(id);
          inDegree.set(id, (inDegree.get(id) || 0) + 1);
        }
      }
    }

    const queue: string[] = [];
    for (const [id, deg] of inDegree.entries()) {
      if (deg === 0) queue.push(id);
    }

    const sorted: ModuleDefinition[] = [];
    while (queue.length > 0) {
      const u = queue.shift()!;
      sorted.push(this.modules.get(u)!);

      for (const v of adj.get(u) || []) {
        inDegree.set(v, inDegree.get(v)! - 1);
        if (inDegree.get(v) === 0) {
          queue.push(v);
        }
      }
    }

    if (sorted.length !== this.modules.size) {
      throw new Error(
        'Circular dependency detected in registered business modules.'
      );
    }

    return sorted;
  }

  /**
   * Retrieves all permissions across all modules.
   */
  public getAllPermissions(): PermissionDefinition[] {
    const all: PermissionDefinition[] = [];
    for (const list of this.permissions.values()) {
      all.push(...list);
    }
    return all;
  }

  /**
   * Retrieves all permissions declared by a specific module.
   */
  public getPermissionsForModule(moduleId: string): PermissionDefinition[] {
    return this.permissions.get(moduleId) || [];
  }

  /**
   * Validates graph integrity: ensures all dependencies exist and no cycles exist.
   */
  public validateRegistryIntegrity(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check missing dependencies
    for (const [id, mod] of this.modules.entries()) {
      for (const dep of mod.dependencies) {
        if (!this.modules.has(dep)) {
          errors.push(
            `Module "${id}" declares missing dependency "${dep}".`
          );
        }
      }
    }

    // Check circular dependencies
    try {
      this.getRegisteredModules();
    } catch (err: unknown) {
      errors.push((err as Error).message);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Resets internal registry state (strictly for test isolation).
   */
  public resetForTesting(): void {
    this.modules.clear();
    this.permissions.clear();
  }
}

/**
 * Singleton instance of the Central Module Registry.
 */
export const moduleRegistry = new ModuleRegistry();
