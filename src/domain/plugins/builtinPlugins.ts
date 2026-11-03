/**
 * Built-in domain plugins for Unified Design Studio.
 */
import type { StudioPlugin } from './types';

export const kitchenPlugin: StudioPlugin = {
  id: 'kitchen-design',
  name: 'Kitchen Design Studio',
  version: '1.0.0',
  description: 'Modular cabinetry, worktops, sinks, appliances, and MEP coordination',
  supportedEntityTypes: ['cabinet', 'appliance', 'fixture'],
  defaultRulePackId: 'factory-standard',
  toolbarItems: [
    { id: 'add-base-cabinet', label: 'Base Unit', iconName: 'box', commandName: 'insertCabinet', shortcut: 'B' },
    { id: 'add-wall-cabinet', label: 'Wall Unit', iconName: 'archive', commandName: 'insertCabinet', shortcut: 'W' },
    { id: 'add-tall-cabinet', label: 'Tall Unit', iconName: 'columns', commandName: 'insertCabinet', shortcut: 'T' },
    { id: 'add-sink', label: 'Sink', iconName: 'droplet', commandName: 'insertAppliance', shortcut: 'S' },
  ],
};

export const homePlugin: StudioPlugin = {
  id: 'home-design',
  name: 'Whole-Home Architecture',
  version: '1.0.0',
  description: 'Architectural walls, rooms, doors, windows, and loose furniture',
  supportedEntityTypes: ['wall', 'opening', 'furniture'],
  toolbarItems: [
    { id: 'draw-wall', label: 'Draw Wall', iconName: 'pen-tool', commandName: 'drawWall', shortcut: 'L' },
    { id: 'add-door', label: 'Add Door', iconName: 'door', commandName: 'insertOpening', shortcut: 'D' },
    { id: 'add-window', label: 'Add Window', iconName: 'maximize', commandName: 'insertOpening', shortcut: 'O' },
    { id: 'add-furniture', label: 'Add Furniture', iconName: 'armchair', commandName: 'insertFurniture', shortcut: 'F' },
  ],
};

export const officePlugin: StudioPlugin = {
  id: 'office-layout',
  name: 'Office & Commercial Workspaces',
  version: '1.0.0',
  description: 'Modular workstations, conference tables, acoustic dividers, and ergonomic seating',
  supportedEntityTypes: ['furniture', 'fixture'],
  toolbarItems: [
    { id: 'add-workstation', label: 'Workstation', iconName: 'monitor', commandName: 'insertFurniture', shortcut: 'Alt+W' },
    { id: 'add-conference', label: 'Conference Table', iconName: 'users', commandName: 'insertFurniture', shortcut: 'Alt+C' },
  ],
};

export const lightingPlugin: StudioPlugin = {
  id: 'lighting-planning',
  name: 'Lighting & Electrical Planning',
  version: '1.0.0',
  description: 'Ceiling downlights, under-cabinet strips, track lights, and power drops',
  supportedEntityTypes: ['fixture'],
  toolbarItems: [
    { id: 'add-downlight', label: 'Downlight', iconName: 'sun', commandName: 'insertFixture', shortcut: 'Alt+D' },
    { id: 'add-led-strip', label: 'LED Strip', iconName: 'minus', commandName: 'insertFixture', shortcut: 'Alt+S' },
  ],
};

export const builtInPlugins: StudioPlugin[] = [
  kitchenPlugin,
  homePlugin,
  officePlugin,
  lightingPlugin,
];
