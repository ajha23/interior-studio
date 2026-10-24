import { SCHEMA_VERSION, type MigrationRegistry } from '@studio/core';

/** Scene schema history. Add a step here whenever the Project shape changes. */
export const SCENE_MIGRATIONS: MigrationRegistry = { current: SCHEMA_VERSION, steps: {} };
