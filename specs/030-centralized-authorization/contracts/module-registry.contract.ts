/**
 * Contract: Central Module & Capability Registry API
 * Layer: Pure domain / framework-free TypeScript
 */

import { ModuleDefinition, PermissionDefinition } from '../data-model';

export interface IModuleRegistry {
  /**
   * Registers a business module and its declared capabilities with the central framework.
   * Validates dependency ordering and rejects circular dependencies.
   */
  registerModule(definition: ModuleDefinition): void;

  /**
   * Registers granular permissions declared by a specific module.
   */
  registerPermissions(moduleId: string, permissions: PermissionDefinition[]): void;

  /**
   * Retrieves all registered modules in topological dependency order.
   */
  getRegisteredModules(): ReadonlyArray<ModuleDefinition>;

  /**
   * Retrieves a specific module by its unique identifier.
   */
  getModule(moduleId: string): ModuleDefinition | undefined;

  /**
   * Retrieves all registered permissions across all modules, grouped by module.
   */
  getAllPermissions(): ReadonlyArray<PermissionDefinition>;

  /**
   * Retrieves all permissions registered by a specific module.
   */
  getPermissionsForModule(moduleId: string): ReadonlyArray<PermissionDefinition>;

  /**
   * Verifies that all declared dependencies are registered and valid.
   */
  validateRegistryIntegrity(): { valid: boolean; errors: string[] };

  /**
   * Clears registry entries (used strictly for test isolation).
   */
  resetForTesting(): void;
}
