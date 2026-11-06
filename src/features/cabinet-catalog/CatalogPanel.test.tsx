import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createProject, DEFAULT_ROOM } from '@/domain';
import { CatalogPanel } from './CatalogPanel';
import { useEditorStore } from '@/state/editorStore';

const store = () => useEditorStore.getState();

beforeEach(() => {
  store().openProject(createProject({ name: 'Test', room: DEFAULT_ROOM, layout: 'straight' }));
});

describe('CatalogPanel (Product Library & Categories)', () => {
  it('renders product category groups from the library', () => {
    render(<CatalogPanel />);
    expect(screen.getByText('Base units')).toBeInTheDocument();
    expect(screen.getByText('Cabinet Waste Systems')).toBeInTheDocument();
    expect(screen.getByText('Drawer Inserts & Organizers')).toBeInTheDocument();
    expect(screen.getByText('Cabinet Flap & Lifter Hardware')).toBeInTheDocument();
  });

  it('filters library items when switching to Fittings tab', async () => {
    const user = userEvent.setup();
    render(<CatalogPanel />);

    await user.click(screen.getByRole('button', { name: /Fittings/i }));
    expect(screen.queryByText('Base units')).not.toBeInTheDocument();
    expect(screen.getByText('Cabinet Waste Systems')).toBeInTheDocument();
    expect(screen.getByText('Drawer Inserts & Organizers')).toBeInTheDocument();
  });

  it('filters library items by text search query', async () => {
    const user = userEvent.setup();
    render(<CatalogPanel />);

    const searchInput = screen.getByLabelText('Filter catalog');
    await user.type(searchInput, 'Cargo Soft');

    expect(screen.getByText(/Hailo Cargo Soft Short 450/i)).toBeInTheDocument();
    expect(screen.getByText(/Hailo Cargo Soft Short 600/i)).toBeInTheDocument();
    expect(screen.queryByText('FREEfold')).not.toBeInTheDocument();
  });

  it('adds a cabinet with target width when clicking a product item', async () => {
    const user = userEvent.setup();
    const count = store().project!.cabinets.length;
    render(<CatalogPanel />);

    // Click on Hailo Cargo Soft Short 450
    const itemBtn = screen.getByRole('button', { name: /Add Hailo Cargo Soft Short 450/i });
    await user.click(itemBtn);

    expect(store().project!.cabinets).toHaveLength(count + 1);
    const added = store().project!.cabinets.find((c) => c.id === store().selectedId)!;
    expect(added.dimensions.width).toBe(450);
  });
});
