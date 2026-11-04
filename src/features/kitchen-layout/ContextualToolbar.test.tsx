import { render, screen, fireEvent, act } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { ContextualToolbar } from './ContextualToolbar';
import { useEditorStore } from '@/state/editorStore';
import { createExampleProject } from '@/domain';

describe('ContextualToolbar (Task 5)', () => {
  beforeEach(() => {
    act(() => {
      const project = createExampleProject();
      useEditorStore.setState({
        project,
        selectedId: null,
      });
    });
  });

  it('renders nothing when nothing is selected', () => {
    render(<ContextualToolbar />);
    expect(screen.queryByTestId('contextual-toolbar')).not.toBeInTheDocument();
  });

  it('renders contextual actions when a cabinet is selected', () => {
    const project = useEditorStore.getState().project!;
    const cab = project.cabinets[0]!;
    act(() => {
      useEditorStore.setState({ selectedId: cab.id });
    });

    render(<ContextualToolbar />);
    expect(screen.getByTestId('contextual-toolbar')).toBeInTheDocument();
    expect(screen.getByTestId('context-rotate-btn')).toBeInTheDocument();
    expect(screen.getByTestId('context-focus-btn')).toBeInTheDocument();
    expect(screen.getByTestId('context-duplicate-btn')).toBeInTheDocument();
    expect(screen.getByTestId('context-delete-btn')).toBeInTheDocument();
  });

  it('rotates the selected cabinet 90 degrees when rotate is clicked', () => {
    const project = useEditorStore.getState().project!;
    const cab = project.cabinets[0]!;
    // Position free-standing in open space so 90 deg rotation has collision clearance
    cab.position = { x: 2000, y: 0, z: 2000 };
    delete cab.wallId;
    cab.rotationY = 0;
    act(() => {
      useEditorStore.setState({ selectedId: cab.id, project });
    });

    render(<ContextualToolbar />);
    const rotateBtn = screen.getByTestId('context-rotate-btn');
    fireEvent.click(rotateBtn);

    const updatedProject = useEditorStore.getState().project!;
    const updatedCab = updatedProject.cabinets.find((c) => c.id === cab.id)!;
    expect(updatedCab.rotationY).toBe(90);
  });

  it('deletes the selected cabinet when delete is clicked', () => {
    const project = useEditorStore.getState().project!;
    const cab = project.cabinets[0]!;
    act(() => {
      useEditorStore.setState({ selectedId: cab.id });
    });

    render(<ContextualToolbar />);
    const deleteBtn = screen.getByTestId('context-delete-btn');
    fireEvent.click(deleteBtn);

    const updatedProject = useEditorStore.getState().project!;
    expect(updatedProject.cabinets.find((c) => c.id === cab.id)).toBeUndefined();
  });

  it('clears selection when close button is clicked', () => {
    const project = useEditorStore.getState().project!;
    const cab = project.cabinets[0]!;
    act(() => {
      useEditorStore.setState({ selectedId: cab.id });
    });

    render(<ContextualToolbar />);
    const closeBtn = screen.getByTestId('context-close-btn');
    fireEvent.click(closeBtn);

    expect(useEditorStore.getState().selectedId).toBeNull();
  });
});
