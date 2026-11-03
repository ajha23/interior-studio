import { render, screen, fireEvent, act } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { HierarchicalOutliner } from './HierarchicalOutliner';
import { useEditorStore } from '@/state/editorStore';
import { createExampleProject } from '@/domain';

describe('HierarchicalOutliner (Task 5)', () => {
  beforeEach(() => {
    act(() => {
      useEditorStore.setState({
        project: createExampleProject(),
        selectedId: null,
      });
    });
  });

  it('renders architecture walls and cabinetry nodes', () => {
    render(<HierarchicalOutliner />);

    expect(screen.getByTestId('hierarchical-outliner')).toBeInTheDocument();
    expect(screen.getByTestId('outliner-section-architecture')).toBeInTheDocument();
    expect(screen.getByTestId('outliner-section-cabinetry')).toBeInTheDocument();

    // Walls
    expect(screen.getByTestId('outliner-node-wall-back')).toBeInTheDocument();
    expect(screen.getByTestId('outliner-node-wall-left')).toBeInTheDocument();

    // Check cabinet node
    const project = useEditorStore.getState().project!;
    const firstCab = project.cabinets[0];
    if (firstCab) {
      expect(screen.getByTestId(`outliner-node-${firstCab.id}`)).toBeInTheDocument();
    }
  });

  it('selects an entity upon clicking its node', () => {
    render(<HierarchicalOutliner />);

    const backWallNode = screen.getByTestId('outliner-node-wall-back');
    fireEvent.click(backWallNode);

    expect(useEditorStore.getState().selectedId).toBe('wall-back');

    const project = useEditorStore.getState().project!;
    const firstCab = project.cabinets[0];
    if (firstCab) {
      const cabNode = screen.getByTestId(`outliner-node-${firstCab.id}`);
      fireEvent.click(cabNode);
      expect(useEditorStore.getState().selectedId).toBe(firstCab.id);
    }
  });

  it('toggles section collapse when header is clicked', () => {
    render(<HierarchicalOutliner />);

    const archHeader = screen.getByTestId('outliner-section-architecture');
    expect(screen.getByTestId('outliner-node-wall-back')).toBeInTheDocument();

    // Collapse
    fireEvent.click(archHeader);
    expect(screen.queryByTestId('outliner-node-wall-back')).not.toBeInTheDocument();

    // Re-expand
    fireEvent.click(archHeader);
    expect(screen.getByTestId('outliner-node-wall-back')).toBeInTheDocument();
  });
});
