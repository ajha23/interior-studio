import { render, screen, fireEvent, act } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { CommandPalette } from './CommandPalette';
import { useCommandPaletteStore } from './commandPaletteStore';
import { useEditorStore } from '@/state/editorStore';
import { createExampleProject } from '@/domain';

describe('Floating Command Palette (Task 4)', () => {
  beforeEach(() => {
    act(() => {
      useCommandPaletteStore.setState({ isOpen: false });
      useEditorStore.setState({
        project: createExampleProject(),
        view: '3d',
      });
    });
  });

  it('toggles open when Cmd+K or Ctrl+K is pressed', () => {
    render(<CommandPalette />);

    expect(screen.queryByTestId('command-palette-backdrop')).not.toBeInTheDocument();

    // Fire Cmd+K
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(screen.getByTestId('command-palette-backdrop')).toBeInTheDocument();

    // Fire Cmd+K again to close
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(screen.queryByTestId('command-palette-backdrop')).not.toBeInTheDocument();
  });

  it('filters commands according to search query input', () => {
    act(() => {
      useCommandPaletteStore.setState({ isOpen: true });
    });

    render(<CommandPalette />);
    const input = screen.getByTestId('command-palette-input');

    // Initially multiple commands are visible
    expect(screen.getByTestId('command-item-view-3d')).toBeInTheDocument();
    expect(screen.getByTestId('command-item-insert-sink')).toBeInTheDocument();

    // Type "sink" into search
    fireEvent.change(input, { target: { value: 'sink' } });
    expect(screen.getByTestId('command-item-insert-sink')).toBeInTheDocument();
    expect(screen.queryByTestId('command-item-view-3d')).not.toBeInTheDocument();
  });

  it('executes command action on Enter and closes palette', () => {
    act(() => {
      useCommandPaletteStore.setState({ isOpen: true });
    });

    render(<CommandPalette />);
    const input = screen.getByTestId('command-palette-input');

    // Filter to floor plan
    fireEvent.change(input, { target: { value: 'floor plan' } });
    const planItem = screen.getByTestId('command-item-view-plan');
    expect(planItem).toBeInTheDocument();

    // Hit Enter
    fireEvent.keyDown(input, { key: 'Enter' });

    // Expect view to have changed to 'plan'
    expect(useEditorStore.getState().view).toBe('plan');
    // Expect palette to have closed
    expect(useCommandPaletteStore.getState().isOpen).toBe(false);
  });

  it('closes palette on Escape key press or backdrop click', () => {
    act(() => {
      useCommandPaletteStore.setState({ isOpen: true });
    });

    render(<CommandPalette />);
    const backdrop = screen.getByTestId('command-palette-backdrop');
    expect(backdrop).toBeInTheDocument();

    // Click backdrop
    fireEvent.click(backdrop);
    expect(useCommandPaletteStore.getState().isOpen).toBe(false);

    // Reopen and test Escape
    act(() => {
      useCommandPaletteStore.setState({ isOpen: true });
    });
    const input = screen.getByTestId('command-palette-input');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(useCommandPaletteStore.getState().isOpen).toBe(false);
  });
});
