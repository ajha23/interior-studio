import { describe, expect, it, vi } from 'vitest';
import { builtInPlugins, homePlugin, kitchenPlugin, lightingPlugin, officePlugin } from './builtinPlugins';
import { StudioPluginRegistry } from './registry';

describe('Studio Plugin Registry & Domain Plugins (Task 3)', () => {
  it('registers and activates built-in domain plugins', () => {
    const registry = new StudioPluginRegistry();

    for (const plugin of builtInPlugins) {
      registry.register(plugin);
    }

    expect(registry.getAll()).toHaveLength(4);
    expect(registry.getActivePlugins()).toHaveLength(4);

    expect(registry.get('kitchen-design')).toBe(kitchenPlugin);
    expect(registry.get('home-design')).toBe(homePlugin);
    expect(registry.get('office-layout')).toBe(officePlugin);
    expect(registry.get('lighting-planning')).toBe(lightingPlugin);
  });

  it('aggregates toolbar items across active plugins', () => {
    const registry = new StudioPluginRegistry();
    registry.register(kitchenPlugin);
    registry.register(homePlugin);

    const toolbars = registry.getToolbarItems();
    const toolbarIds = toolbars.map((item) => item.id);

    // From kitchenPlugin
    expect(toolbarIds).toContain('add-base-cabinet');
    expect(toolbarIds).toContain('add-wall-cabinet');
    // From homePlugin
    expect(toolbarIds).toContain('draw-wall');
    expect(toolbarIds).toContain('add-door');

    // Office plugin not yet registered
    expect(toolbarIds).not.toContain('add-workstation');
  });

  it('supports plugin activation, deactivation, and lifecycle hooks', () => {
    const registry = new StudioPluginRegistry();
    const onActivate = vi.fn();
    const onDeactivate = vi.fn();

    const customPlugin = {
      id: 'custom-mep',
      name: 'Custom MEP Plugin',
      version: '1.0.0',
      description: 'Custom MEP items',
      supportedEntityTypes: ['fixture'],
      toolbarItems: [],
      onActivate,
      onDeactivate,
    };

    // Register without autoActivate
    registry.register(customPlugin, false);
    expect(registry.isPluginActive('custom-mep')).toBe(false);
    expect(onActivate).not.toHaveBeenCalled();

    // Activate
    registry.activate('custom-mep');
    expect(registry.isPluginActive('custom-mep')).toBe(true);
    expect(onActivate).toHaveBeenCalledTimes(1);

    // Deactivate
    registry.deactivate('custom-mep');
    expect(registry.isPluginActive('custom-mep')).toBe(false);
    expect(onDeactivate).toHaveBeenCalledTimes(1);
  });

  it('collects unique supported entity types', () => {
    const registry = new StudioPluginRegistry();
    registry.register(kitchenPlugin); // cabinet, appliance, fixture
    registry.register(homePlugin); // wall, opening, furniture

    const types = registry.getSupportedEntityTypes();
    expect(types).toContain('cabinet');
    expect(types).toContain('appliance');
    expect(types).toContain('fixture');
    expect(types).toContain('wall');
    expect(types).toContain('opening');
    expect(types).toContain('furniture');
  });

  it('safely handles unregister and reset', () => {
    const registry = new StudioPluginRegistry();
    registry.register(kitchenPlugin);
    expect(registry.getAll()).toHaveLength(1);

    const removed = registry.unregister('kitchen-design');
    expect(removed).toBe(true);
    expect(registry.getAll()).toHaveLength(0);
    expect(registry.getActivePlugins()).toHaveLength(0);
  });
});
