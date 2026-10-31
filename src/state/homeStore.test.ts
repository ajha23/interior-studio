import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { roomProjectId } from '@/domain';
import { loadHome } from '@/persistence/projectDb';
import { assistantConversation, useAssistantStore } from './assistantStore';
import { useEditorStore } from './editorStore';
import { useHomeStore } from './homeStore';

const store = () => useHomeStore.getState();

beforeEach(async () => {
  store().close();
  await store().create({ bhk: 2, kind: 'apartment', style: 'modern' });
});

describe('a home and its rooms', () => {
  it('opens a room in the editor and copies every edit back into the home', async () => {
    const bedroom = store().home!.rooms.find((r) => r.type === 'bedroom')!;
    expect(store().enterRoom(bedroom.id)).toBe(true);
    const editor = useEditorStore.getState();
    expect(editor.project!.id).toBe(roomProjectId(store().home!, bedroom));
    expect(editor.project!.name).toBe(`${store().home!.name} · ${bedroom.name}`);
    const bed = editor.project!.furniture.find((f) => f.type === 'bed')!;
    expect(editor.dispatch({ type: 'resize_furniture', furnitureId: bed.id, dimensions: { ...bed.dimensions, width: 1200 } }).success).toBe(true);
    const synced = store().home!.rooms.find((r) => r.id === bedroom.id)!;
    expect(synced.design.furniture.find((f) => f.id === bed.id)!.dimensions.width).toBe(1200);
    // The room keeps its own id inside the home.
    expect(synced.design.id).toBe(bedroom.design.id);
    expect(store().dirty).toBe(true);
    await store().save();
    const saved = await loadHome(store().home!.id);
    expect(saved?.ok && saved.home.rooms.find((r) => r.id === bedroom.id)!.design.furniture.find((f) => f.id === bed.id)!.dimensions.width).toBe(1200);
    expect(store().dirty).toBe(false);
  });

  it('resizes, renames and retypes rooms, and rejects sizes the room cannot have', () => {
    const living = store().home!.rooms.find((r) => r.type === 'living')!;
    expect(store().updateRoom(living.id, { width: living.design.room.width + 300, name: 'Lounge' })).toEqual([]);
    const after = store().home!.rooms.find((r) => r.id === living.id)!;
    expect(after.design.room.width).toBe(living.design.room.width + 300);
    expect(after.name).toBe('Lounge');
    expect(store().updateRoom(living.id, { width: 900 })[0]).toMatch(/at least 1500 mm/);
    expect(store().updateRoom(living.id, { type: 'family' })).toEqual([]);
  });

  it('restyles every room at once', () => {
    store().restyle('industrial');
    const home = store().home!;
    expect(home.style).toBe('Industrial');
    for (const r of home.rooms) expect(r.design.materials['style-floor']!.name).toBe('Polished concrete');
    expect(home.rooms.find((r) => r.type === 'bedroom')!.design.surfaces.wall).toBe('style-wall');
  });

  it('the assistant designs a home from a sentence', async () => {
    useAssistantStore.getState().setPrefs({ provider: 'rules' });
    const reply = await assistantConversation().send('design a 3BHK villa of 2400 sq ft');
    expect(reply).toMatchObject({ kind: 'answer', text: expect.stringMatching(/^Designing a 3BHK villa of about 2400 sq ft/) });
    await new Promise((r) => setTimeout(r, 50));
    expect(store().home).toMatchObject({ kind: 'villa', bhk: 3, levels: 2 });
  });
});

describe('the assistant on the home plan', () => {
  it('restyles, resizes and describes the home, and opens rooms by name', async () => {
    const { homeCommand, findRoom } = await import('./homeCommands');
    const home = () => store().home!;
    expect(homeCommand('make it japandi')).toMatch(/Applied the Japandi style to every room/);
    expect(home().style).toBe('Japandi');
    expect(homeCommand('make bedroom 2 4 m wide')).toMatch(/Bedroom 2 is now 4000 mm wide/);
    expect(home().rooms.find((r) => r.name === 'Bedroom 2')!.design.room.width).toBe(4000);
    expect(homeCommand('make the kitchen 1 m wide')).toMatch(/at least 1500 mm/);
    expect(homeCommand('how big is it?')).toMatch(/2BHK apartment, [\d,]+ sq ft carpet/);
    expect(findRoom(home().rooms, 'the master bath')?.name).toBe('Master bath');
    expect(findRoom(home().rooms, 'kitchen')?.type).toBe('kitchen');
    expect(homeCommand('design the kitchen')).toMatch(/^Opening the kitchen/);
    expect(window.location.hash).toMatch(/\/room\/room-/);
    expect(homeCommand('add a sofa')).toMatch(/open that room/);
  });
});
