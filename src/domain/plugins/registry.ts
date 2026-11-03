/**
 * Studio Plugin Registry.
 * Manages plugin lifecycle, active vertical domains, aggregated toolbars, and entity mappings.
 */
import type { PluginToolbarItem, StudioPlugin } from './types';

export class StudioPluginRegistry {
  private plugins = new Map<string, StudioPlugin>();
  private activePluginIds = new Set<string>();

  /**
   * Registers a plugin. By default, autoActivates if autoActivate is true (defaults to true).
   */
  public register(plugin: StudioPlugin, autoActivate = true): void {
    if (this.plugins.has(plugin.id)) {
      throw new Error(`Plugin with id '${plugin.id}' is already registered.`);
    }
    this.plugins.set(plugin.id, plugin);
    if (autoActivate) {
      this.activate(plugin.id);
    }
  }

  /**
   * Unregisters a plugin. Deactivates it first if active.
   */
  public unregister(pluginId: string): boolean {
    if (!this.plugins.has(pluginId)) {
      return false;
    }
    if (this.activePluginIds.has(pluginId)) {
      this.deactivate(pluginId);
    }
    return this.plugins.delete(pluginId);
  }

  public get(pluginId: string): StudioPlugin | undefined {
    return this.plugins.get(pluginId);
  }

  public getAll(): StudioPlugin[] {
    return Array.from(this.plugins.values());
  }

  public activate(pluginId: string): void {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new Error(`Cannot activate unregistered plugin '${pluginId}'.`);
    }
    if (!this.activePluginIds.has(pluginId)) {
      this.activePluginIds.add(pluginId);
      plugin.onActivate?.();
    }
  }

  public deactivate(pluginId: string): void {
    const plugin = this.plugins.get(pluginId);
    if (this.activePluginIds.has(pluginId)) {
      this.activePluginIds.delete(pluginId);
      plugin?.onDeactivate?.();
    }
  }

  public isPluginActive(pluginId: string): boolean {
    return this.activePluginIds.has(pluginId);
  }

  public getActivePlugins(): StudioPlugin[] {
    return Array.from(this.activePluginIds)
      .map((id) => this.plugins.get(id))
      .filter((p): p is StudioPlugin => p !== undefined);
  }

  /**
   * Aggregates toolbar items across all currently active plugins.
   */
  public getToolbarItems(): PluginToolbarItem[] {
    const items: PluginToolbarItem[] = [];
    for (const plugin of this.getActivePlugins()) {
      items.push(...plugin.toolbarItems);
    }
    return items;
  }

  /**
   * Returns a deduplicated list of supported entity types from all active plugins.
   */
  public getSupportedEntityTypes(): string[] {
    const types = new Set<string>();
    for (const plugin of this.getActivePlugins()) {
      for (const type of plugin.supportedEntityTypes) {
        types.add(type);
      }
    }
    return Array.from(types);
  }

  /**
   * Resets registry state (used for testing or teardown).
   */
  public reset(): void {
    for (const pluginId of Array.from(this.activePluginIds)) {
      this.deactivate(pluginId);
    }
    this.plugins.clear();
    this.activePluginIds.clear();
  }
}

/** Default singleton instance of the studio plugin registry. */
export const defaultPluginRegistry = new StudioPluginRegistry();
