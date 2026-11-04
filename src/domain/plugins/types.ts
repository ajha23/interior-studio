/**
 * Studio Plugin System Types.
 * Enables decoupled domain verticals (Kitchen, Home, Office, Lighting) to register
 * custom toolbars, schemas, inspectors, and lifecycle hooks into the studio core.
 */

export interface PluginToolbarItem {
  id: string;
  label: string;
  iconName: string;
  commandName: string;
  shortcut?: string;
}

export interface StudioPlugin {
  id: string;
  name: string;
  version: string;
  description: string;
  supportedEntityTypes: string[];
  toolbarItems: PluginToolbarItem[];
  defaultRulePackId?: string;
  onActivate?: () => void;
  onDeactivate?: () => void;
}

