/**
 * Client packages: the editable presentation layer over the canonical design. A package stores
 * only what a designer authors — page order and names, paper, notes, label positions, reference
 * images, snapshots and the studio title block — never geometry or measurements. Technical pages
 * are pinned to a design revision (whose project file the package keeps) and are composed from it
 * every time they are shown or exported.
 *
 * Packages are their own versioned document (not part of the project file), with migrations like
 * project files. Every string is length-capped and stripped of control characters on load.
 */
import { z } from 'zod';
import { WallIdSchema } from '@/domain/schema';

export const PACKAGE_VERSION = 1;
export const PACKAGE_FORMAT = 'interior-studio/client-package';

/** Removes control characters (keeps line breaks) so nothing odd reaches drawings or files. */
// eslint-disable-next-line no-control-regex
export const cleanText = (s: string) => s.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '');
const Text = (max: number) => z.string().max(max).transform(cleanText);
const Id = z.string().regex(/^[A-Za-z0-9_-]{1,48}$/, 'ids are letters, digits, "-" and "_"');
const Num = z.number().finite();

export const TEMPLATES = ['layout', 'elevation', 'hardware', 'presentation', 'schedule'] as const;
export type Template = (typeof TEMPLATES)[number];
export const TEMPLATE_LABEL: Record<Template, string> = {
  layout: 'Kitchen layout',
  elevation: 'Cabinet elevation',
  hardware: 'Hardware & accessories board',
  presentation: '3D presentation view',
  schedule: 'Cabinet schedule',
};
/** Pages whose content is generated from the design (pinned to a revision). */
export const TECHNICAL: readonly Template[] = ['layout', 'elevation', 'schedule'];

export const NoteSchema = z.object({
  id: Id,
  text: Text(400),
  /** Top-left of the first line, paper mm. */
  x: Num,
  y: Num,
  size: z.number().min(1.5).max(12),
  bold: z.boolean(),
  color: z.enum(['black', 'red']),
});
export type Note = z.infer<typeof NoteSchema>;

/**
 * A presentation edit of a generated element, in paper mm. For dimensions `dx` slides the text along
 * the line and `dy` moves the line away from (or towards) the object; for tags and texts both move it.
 * Never a measurement.
 */
export const OverrideSchema = z.object({ dx: Num, dy: Num, hidden: z.boolean().optional() });
export type Override = z.infer<typeof OverrideSchema>;

export const CardSchema = z.object({ id: Id, assetId: Id.nullable(), caption: Text(80), spec: Text(200) });
export type Card = z.infer<typeof CardSchema>;

/** The design revision a technical page was generated from, and a hash of what it showed. */
export const SourceSchema = z.object({ revision: z.string().max(40), hash: z.string().max(40) });

/**
 * How a 3D snapshot was framed, so it can be captured again exactly: a standard camera preset, an
 * element in focus (the island) or a saved viewpoint. Absent for a free camera (not reproducible).
 */
export const SnapshotCameraSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('preset'), preset: z.enum(['iso', 'top', 'front', 'left', 'right']) }),
  z.object({ kind: z.literal('focus'), id: z.string().max(64) }),
  z.object({ kind: z.literal('viewpoint'), id: z.string().max(64) }),
]);
export type SnapshotCamera = z.infer<typeof SnapshotCameraSchema>;

export const PageSchema = z.object({
  id: Id,
  template: z.enum(TEMPLATES),
  name: Text(60),
  paper: z.enum(['A3', 'A4']),
  orientation: z.enum(['landscape', 'portrait']),
  heading: Text(90),
  notes: z.array(NoteSchema).max(100),
  overrides: z.record(z.string().max(160), OverrideSchema),
  source: SourceSchema.nullable(),
  /** Elevations: the wall and the reference letter shown on the layout. */
  wallId: WallIdSchema.optional(),
  label: Text(4).optional(),
  /** Hardware boards. */
  columns: z.number().int().min(1).max(6).optional(),
  cards: z.array(CardSchema).max(40).optional(),
  /** Presentation pages: a captured 3D view and the revision it shows. */
  // `camera` is optional, so packages saved before named views load unchanged (no version bump).
  snapshot: z.object({ assetId: Id, revision: z.string().max(40), caption: Text(120), camera: SnapshotCameraSchema.optional() }).nullable().optional(),
});
export type Page = z.infer<typeof PageSchema>;

export const InfoSchema = z.object({
  projectTitle: Text(120),
  client: Text(120),
  address: Text(160),
  date: Text(30),
  drawnBy: Text(60),
  approvedBy: Text(60),
  referenceBy: Text(60),
  studio: Text(60),
  studioAddress: Text(160),
});
export type PackageInfo = z.infer<typeof InfoSchema>;

export const ClientPackageSchema = z.object({
  id: Id,
  projectId: z.string().max(80),
  name: Text(80),
  info: InfoSchema,
  revisions: z.array(z.object({ no: Text(6), date: Text(30), description: Text(120) })).max(20),
  /** Project files of the revisions technical pages are pinned to. */
  sources: z.array(z.object({ revision: z.string().max(40), file: z.string() })).max(40),
  pages: z.array(PageSchema).max(60),
});
export type ClientPackage = z.infer<typeof ClientPackageSchema>;

interface Envelope {
  format: typeof PACKAGE_FORMAT;
  schemaVersion: number;
  savedAt: string;
  package: ClientPackage;
}

/** Upgrades from version N to N + 1, keyed by N. Never edit an existing entry. */
export const MIGRATIONS: Record<number, (pkg: Record<string, unknown>) => Record<string, unknown>> = {};

export function serializePackage(pkg: ClientPackage, savedAt = new Date()): string {
  const envelope: Envelope = { format: PACKAGE_FORMAT, schemaVersion: PACKAGE_VERSION, savedAt: savedAt.toISOString(), package: pkg };
  return JSON.stringify(envelope);
}

export type PackageParse = { ok: true; package: ClientPackage } | { ok: false; errors: string[] };

export function parsePackageFile(text: string): PackageParse {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['The package file is not valid JSON.'] };
  }
  const env = raw as Partial<Envelope> | null;
  if (!env || env.format !== PACKAGE_FORMAT || typeof env.schemaVersion !== 'number') return { ok: false, errors: ['This is not an Interior Studio client package.'] };
  if (env.schemaVersion > PACKAGE_VERSION) return { ok: false, errors: [`The package was saved by a newer version (package schema ${env.schemaVersion}; this app reads up to ${PACKAGE_VERSION}).`] };
  let data = env.package as unknown as Record<string, unknown>;
  for (let v = env.schemaVersion; v < PACKAGE_VERSION; v++) {
    const migrate = MIGRATIONS[v];
    if (!migrate) return { ok: false, errors: [`No migration from package schema ${v}.`] };
    data = migrate(data);
  }
  const parsed = ClientPackageSchema.safeParse(data);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.slice(0, 10).map((i) => `${i.path.join('.')}: ${i.message}`) };
  return { ok: true, package: parsed.data };
}
