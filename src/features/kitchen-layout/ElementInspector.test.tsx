import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { createProject, DEFAULT_ROOM } from '@/domain';
import { CatalogPanel } from '@/features/cabinet-catalog/CatalogPanel';
import { useEditorStore, useSelectedElement } from '@/state/editorStore';
import { ElementInspector } from './ElementInspector';
import { FeedbackBanner } from './FeedbackBanner';

function InspectorHarness() {
  const el = useSelectedElement();
  return (
    <>
      <FeedbackBanner />
      {el ? <ElementInspector key={el.id} element={el} /> : <p>nothing selected</p>}
    </>
  );
}

const store = () => useEditorStore.getState();
const base = () => store().project!.cabinets.find((c) => c.type === 'base')!;

beforeEach(() => {
  store().openProject(createProject({ name: 'RTL', room: DEFAULT_ROOM, layout: 'straight' }));
  store().select(base().id);
});

describe('ElementInspector', () => {
  it('resizes the selected cabinet from the width field, keeping its id', async () => {
    const user = userEvent.setup();
    const id = base().id;
    render(<InspectorHarness />);
    const width = screen.getByTestId('inspector-width');
    await user.clear(width);
    await user.type(width, '900{Enter}');
    expect(base()).toMatchObject({ id, dimensions: { width: 900, height: 720, depth: 560 } });
    expect(width).toHaveValue('900');
  });

  it('rejects an out-of-range width with a readable message and keeps the previous value', async () => {
    const user = userEvent.setup();
    const before = store().project;
    render(<InspectorHarness />);
    const width = screen.getByTestId('inspector-width');
    await user.clear(width);
    await user.type(width, '1500{Enter}');
    expect(await screen.findByTestId('command-error')).toHaveTextContent('Width 1500 mm is outside the base cabinet range 150–1200 mm');
    expect(store().project).toBe(before);
    expect(width).toHaveValue('600');
  });

  it('never sends non-numeric input to the domain', async () => {
    const user = userEvent.setup();
    const before = store().project;
    render(<InspectorHarness />);
    const width = screen.getByTestId('inspector-width');
    await user.clear(width);
    await user.type(width, 'wide{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent('whole number of millimetres');
    expect(store().project).toBe(before);
  });

  it('changes the shutter finish without touching dimensions', async () => {
    const user = userEvent.setup();
    const dims = base().dimensions;
    render(<InspectorHarness />);
    await user.click(screen.getByRole('radio', { name: 'Natural oak' }));
    expect(base().materialId).toBe('shutter-oak');
    expect(base().dimensions).toEqual(dims);
  });

  it('removes the element', async () => {
    const user = userEvent.setup();
    const id = base().id;
    render(<InspectorHarness />);
    await user.click(screen.getByRole('button', { name: 'Remove unit' }));
    expect(store().project!.cabinets.some((c) => c.id === id)).toBe(false);
    expect(screen.getByText('nothing selected')).toBeInTheDocument();
  });
});

describe('CatalogPanel', () => {
  it('adds a real unit and selects it', async () => {
    const user = userEvent.setup();
    const count = store().project!.cabinets.length;
    render(<CatalogPanel />);
    await user.click(screen.getByRole('button', { name: 'Add Wall cabinet 400 × 720 × 350' }));
    expect(store().project!.cabinets).toHaveLength(count + 1);
    const added = store().project!.cabinets.find((c) => c.id === store().selectedId)!;
    expect(added).toMatchObject({ type: 'wall', dimensions: { width: 400 } });
  });
});

describe('InteriorEditor (inside the inspector)', () => {
  const wallCab = () => store().project!.cabinets.find((c) => c.type === 'wall')!;

  it('applies the crockery preset: glass doors, plate rack and glass shelves', async () => {
    const user = userEvent.setup();
    store().select(wallCab().id);
    render(<InspectorHarness />);
    await user.click(screen.getByRole('button', { name: 'Crockery unit' }));
    expect(wallCab().frontStyle).toBe('glass');
    expect(wallCab().interior.sections[0]!.fittings.map((f) => f.kind)).toEqual(['plate-rack', 'shelf']);
    expect(screen.getByRole('radio', { name: 'Glass doors' })).toHaveAttribute('aria-checked', 'true');
  });

  it('adds a section and a drawer, then edits the drawer height exactly', async () => {
    const user = userEvent.setup();
    render(<InspectorHarness />);
    await user.click(screen.getByRole('button', { name: 'Add a section' }));
    expect(base().interior.sections).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Add drawer to section 2' }));
    expect(base().interior.sections[1]!.fittings).toEqual([{ kind: 'drawer', y: 0, height: 150 }]);
    const y = screen.getByTestId('fitting-y');
    await user.clear(y);
    await user.type(y, '40{Enter}');
    expect(base().interior.sections[1]!.fittings[0]).toMatchObject({ y: 40 });
  });

  it('rejects a fitting moved into another one, keeping the interior', async () => {
    const user = userEvent.setup();
    render(<InspectorHarness />);
    await user.click(screen.getByRole('button', { name: 'Add drawer to section 1' }));
    const before = base().interior;
    const y = screen.getByTestId('fitting-y');
    await user.clear(y);
    await user.type(y, String((before.sections[0]!.fittings[0] as { y: number }).y) + '{Enter}');
    expect(await screen.findByTestId('command-error')).toHaveTextContent(/overlaps/);
    expect(base().interior).toBe(before);
  });
});
