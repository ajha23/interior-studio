/**
 * Project files: a versioned JSON envelope. Loading runs schema migrations in order, then
 * validates the result with Zod and the project invariants. Invalid files are rejected with
 * readable errors instead of being partially loaded.
 */
import { validateProject, type Issue } from '../constraints/validate';
import { KitchenProjectSchema, SCHEMA_VERSION, zodMessages, type KitchenProject } from '../schema';

export const FILE_FORMAT = 'interior-studio/kitchen';

interface Envelope {
  format: typeof FILE_FORMAT;
  schemaVersion: number;
  savedAt: string;
  project: KitchenProject;
}

/**
 * Upgrades from version N to N + 1, keyed by N. Add an entry whenever SCHEMA_VERSION is bumped;
 * never edit an existing one, because saved files depend on it.
 */
export const MIGRATIONS: Record<number, (project: Record<string, unknown>) => Record<string, unknown>> = {
  // 1 → 2: cabinets gained an interior and a front style. Self-contained on purpose: later changes
  // to the default interior must not change how old files load.
  1: (project) => ({
    ...project,
    cabinets: (Array.isArray(project.cabinets) ? project.cabinets : []).map((c: Record<string, unknown>) => {
      const height = typeof (c.dimensions as { height?: unknown })?.height === 'number' ? (c.dimensions as { height: number }).height : 720;
      const inside = height - 36;
      const count = c.type === 'sink' || c.type === 'drawer' ? 0 : c.type === 'wall' ? 2 : c.type === 'tall' ? 4 : 1;
      const gap = (inside - count * 18) / (count + 1);
      const fittings = Array.from({ length: count }, (_, i) => ({ kind: 'shelf', y: Math.round(((i + 1) * gap + i * 18) / 5) * 5, glass: false }));
      return { ...c, frontStyle: 'solid', interior: { sections: [{ width: null, fittings }] } };
    }),
  }),
};

export function serializeProject(project: KitchenProject, savedAt = new Date()): string {
  const envelope: Envelope = { format: FILE_FORMAT, schemaVersion: SCHEMA_VERSION, savedAt: savedAt.toISOString(), project };
  return JSON.stringify(envelope, null, 2);
}

export type ParseResult = { ok: true; project: KitchenProject; issues: Issue[] } | { ok: false; errors: string[] };

export function parseProjectFile(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['The file is not valid JSON.'] };
  }
  if (typeof raw !== 'object' || raw === null || (raw as { format?: unknown }).format !== FILE_FORMAT) {
    return { ok: false, errors: ['This is not an Interior Studio kitchen file.'] };
  }
  const envelope = raw as { schemaVersion?: unknown; project?: unknown };
  let version = envelope.schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { ok: false, errors: ['The file has no valid schema version.'] };
  }
  if (version > SCHEMA_VERSION) {
    return { ok: false, errors: [`The file was saved by a newer version of Interior Studio (schema ${version}; this app reads up to ${SCHEMA_VERSION}).`] };
  }
  if (typeof envelope.project !== 'object' || envelope.project === null) return { ok: false, errors: ['The file contains no project.'] };

  let data = envelope.project as Record<string, unknown>;
  while (version < SCHEMA_VERSION) {
    const migrate = MIGRATIONS[version];
    if (!migrate) return { ok: false, errors: [`No migration from schema ${version}.`] };
    data = { ...migrate(data), schemaVersion: version + 1 };
    version += 1;
  }

  const parsed = KitchenProjectSchema.safeParse(data);
  if (!parsed.success) return { ok: false, errors: zodMessages(parsed.error) };
  return { ok: true, project: parsed.data, issues: validateProject(parsed.data) };
}
