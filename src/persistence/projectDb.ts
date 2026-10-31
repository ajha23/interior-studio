/**
 * Local project storage in IndexedDB. Each record holds the serialized project file (the same
 * versioned JSON as an export) plus a small summary for the projects list, so loading always
 * goes through `parseProjectFile` and its migrations.
 */
import { carpetArea, parseHomeFile, parseProjectFile, serializeHome, serializeProject, type Home, type KitchenProject, type ParseResult } from '@/domain';

const DB_NAME = 'interior-studio';
const DB_VERSION = 2;
const STORE = 'projects';
/** Whole homes (apartments, villas): each record holds the serialized home file. */
const HOMES = 'homes';

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

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' }).createIndex('updatedAt', 'updatedAt');
      if (!db.objectStoreNames.contains(HOMES)) db.createObjectStore(HOMES, { keyPath: 'id' }).createIndex('updatedAt', 'updatedAt');
    };
    req.onsuccess = () => resolve(req.result);
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
