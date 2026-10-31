/**
 * Local project storage in IndexedDB. Each record holds the serialized project file (the same
 * versioned JSON as an export) plus a small summary for the projects list, so loading always
 * goes through `parseProjectFile` and its migrations.
 */
import { carpetArea, parseHomeFile, parseProjectFile, serializeHome, serializeProject, type Home, type KitchenProject, type ParseResult } from '@/domain';
import { parsePackageFile, serializePackage, type ClientPackage, type PackageParse } from '@/engine/package/schema';

const DB_NAME = 'interior-studio';
const DB_VERSION = 3;
const STORE = 'projects';
/** Whole homes (apartments, villas): each record holds the serialized home file. */
const HOMES = 'homes';
/** Client packages (one per project for now): the serialized package file. */
const PACKAGES = 'packages';
/** Images of client packages (reference images, 3D snapshots): JPEG bytes, by asset id. */
const ASSETS = 'assets';

export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: string;
  room: { width: number; length: number; height: number };
  elementCount: number;
}

interface ProjectRecord extends ProjectSummary {
  file: string;
}

let dbPromise: Promise<IDBDatabase> | null = null;

/** Shown when another tab, still running an older version, holds the database open during an upgrade. */
export const BLOCKED_MESSAGE = 'Interior Studio is open in another tab with an older version, which blocks an update of local storage. Close or reload the other Interior Studio tabs, then try again.';

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    let failed = false;
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    // Another tab (an older version) has the database open, so the upgrade cannot run: say so instead of
    // waiting forever. If that tab closes later, the connection that then opens is closed again.
    req.onblocked = () => {
      failed = true;
      dbPromise = null;
      reject(new Error(BLOCKED_MESSAGE));
    };
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' }).createIndex('updatedAt', 'updatedAt');
      if (!db.objectStoreNames.contains(HOMES)) db.createObjectStore(HOMES, { keyPath: 'id' }).createIndex('updatedAt', 'updatedAt');
      if (!db.objectStoreNames.contains(PACKAGES)) db.createObjectStore(PACKAGES, { keyPath: 'id' }).createIndex('projectId', 'projectId');
      if (!db.objectStoreNames.contains(ASSETS)) db.createObjectStore(ASSETS, { keyPath: 'id' }).createIndex('projectId', 'projectId');
    };
    req.onsuccess = () => {
      const db = req.result;
      if (failed) return db.close();
      // A newer version opened in another tab needs to upgrade: let it, and reopen on the next request.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      dbPromise = null;
      reject(req.error ?? new Error('Could not open local project storage.'));
    };
  });
  return dbPromise;
}

function request<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>, store = STORE): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = run(tx.objectStore(store));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error ?? req.error ?? new Error('Local storage request failed.'));
        tx.onabort = () => reject(tx.error ?? new Error('Local storage request was aborted.'));
      }),
  );
}

export async function saveProject(project: KitchenProject, now = new Date()): Promise<ProjectSummary> {
  const record: ProjectRecord = {
    id: project.id,
    name: project.name,
    updatedAt: now.toISOString(),
    room: { width: project.room.width, length: project.room.length, height: project.room.height },
    elementCount: project.cabinets.length + project.appliances.length,
    file: serializeProject(project, now),
  };
  await request('readwrite', (s) => s.put(record));
  const { file: _file, ...summary } = record;
  return summary;
}

export async function loadProject(id: string): Promise<ParseResult | null> {
  const record = await request<ProjectRecord | undefined>('readonly', (s) => s.get(id));
  return record ? parseProjectFile(record.file) : null;
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const records = await request<ProjectRecord[]>('readonly', (s) => s.getAll());
  return records
    .map(({ file: _file, ...summary }) => summary)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function deleteProject(id: string): Promise<void> {
  await request('readwrite', (s) => s.delete(id));
  // A project's client packages and their images go with it.
  for (const store of [PACKAGES, ASSETS]) {
    const keys = await request<IDBValidKey[]>('readonly', (s) => s.index('projectId').getAllKeys(id), store);
    for (const key of keys) await request('readwrite', (s) => s.delete(key), store);
  }
}

// ── Client packages and their images ────────────────────────────────────────────────────────────

interface PackageRecord {
  id: string;
  projectId: string;
  updatedAt: string;
  file: string;
}

export async function savePackage(pkg: ClientPackage, now = new Date()): Promise<void> {
  const record: PackageRecord = { id: pkg.id, projectId: pkg.projectId, updatedAt: now.toISOString(), file: serializePackage(pkg, now) };
  await request('readwrite', (s) => s.put(record), PACKAGES);
}

/** The most recently saved package of a project, through the package migrations and validation. */
export async function loadPackageFor(projectId: string): Promise<PackageParse | null> {
  const records = await request<PackageRecord[]>('readonly', (s) => s.index('projectId').getAll(projectId), PACKAGES);
  const latest = records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  return latest ? parsePackageFile(latest.file) : null;
}

export async function deletePackage(id: string): Promise<void> {
  await request('readwrite', (s) => s.delete(id), PACKAGES);
}

export interface StoredImage {
  id: string;
  projectId: string;
  mime: 'image/jpeg';
  w: number;
  h: number;
  data: Uint8Array;
  name: string;
}

export async function saveImage(image: StoredImage): Promise<void> {
  await request('readwrite', (s) => s.put(image), ASSETS);
}

export async function listImages(projectId: string): Promise<StoredImage[]> {
  const records = await request<StoredImage[]>('readonly', (s) => s.index('projectId').getAll(projectId), ASSETS);
  return records.map((r) => ({ ...r, data: new Uint8Array(r.data) }));
}

export interface HomeSummary {
  id: string;
  name: string;
  updatedAt: string;
  kind: Home['kind'];
  bhk: number;
  levels: number;
  rooms: number;
  carpetSqft: number;
}

interface HomeRecord extends HomeSummary {
  file: string;
}

export async function saveHome(home: Home, now = new Date()): Promise<HomeSummary> {
  const record: HomeRecord = { id: home.id, name: home.name, updatedAt: now.toISOString(), kind: home.kind, bhk: home.bhk, levels: home.levels, rooms: home.rooms.length, carpetSqft: Math.round(carpetArea(home).sqft), file: serializeHome(home, now) };
  await request('readwrite', (s) => s.put(record), HOMES);
  const { file: _file, ...summary } = record;
  return summary;
}

export async function loadHome(id: string): Promise<ReturnType<typeof parseHomeFile> | null> {
  const record = await request<HomeRecord | undefined>('readonly', (s) => s.get(id), HOMES);
  return record ? parseHomeFile(record.file) : null;
}

export async function listHomes(): Promise<HomeSummary[]> {
  const records = await request<HomeRecord[]>('readonly', (s) => s.getAll(), HOMES);
  return records.map(({ file: _file, ...summary }) => summary).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function deleteHome(id: string): Promise<void> {
  await request('readwrite', (s) => s.delete(id), HOMES);
}
