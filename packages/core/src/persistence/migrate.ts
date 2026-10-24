/**
 * Scene schema migrations. Every stored version carries `schema_version`;
 * on load we walk forward one step at a time until we reach the current
 * version. Steps are pure functions and never mutate their input.
 */
export type MigrationStep = (scene: unknown) => unknown;

export class SceneMigrationError extends Error {}

export interface MigrationRegistry {
  current: number;
  /** steps[n] upgrades a scene from version n to n + 1. */
  steps: Record<number, MigrationStep>;
}

export function migrateScene<T>(
  scene: unknown,
  fromVersion: number,
  registry: MigrationRegistry,
): T {
  if (!Number.isInteger(fromVersion) || fromVersion < 1) {
    throw new SceneMigrationError(`Invalid stored schema version: ${fromVersion}`);
  }
  if (fromVersion > registry.current) {
    throw new SceneMigrationError(
      `This design was saved by a newer app (schema ${fromVersion}); reload to update.`,
    );
  }
  let out = structuredClone(scene);
  for (let v = fromVersion; v < registry.current; v++) {
    const step = registry.steps[v];
    if (!step) throw new SceneMigrationError(`Missing migration from schema ${v} to ${v + 1}`);
    out = step(out);
  }
  return out as T;
}
